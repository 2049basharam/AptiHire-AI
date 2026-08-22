import { NextResponse } from 'next/server';
import {
  db,
  candidates,
  candidateProfiles,
  candidateEmbeddings,
  memberships,
  jobs,
  candidateEvidence,
  eq,
  and,
} from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { getAIProvider } from '@/lib/ai/provider';
import {
  calculateDetailedMatchScore,
  calculateExperienceYears,
  normalizeSkillName,
} from '@/lib/matching';
import { CandidateSearchIntent, CandidateSearchIntentSchema } from '@/lib/validations/search';
import { JobRequirements } from '@/lib/validations/job';
import { ExtractedProfile } from '@/lib/validations/candidate';
import { cosineDistance, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  logger.info('Candidate search API requested', reqId);

  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on candidate search request', reqId);
      return NextResponse.json(
        { error: { code: 'CSRF_ERROR', message: 'Forbidden. Cross-origin request blocked.' } },
        { status: 403 }
      );
    }

    // 2. Authenticate user
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch (authError: unknown) {
      const errMsg = authError instanceof Error ? authError.message : String(authError);
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: errMsg } },
        { status: 401 }
      );
    }

    // 3. Resolve active organization membership
    const activeMembership = await db.query.memberships.findFirst({
      where: eq(memberships.userId, userId),
    });

    if (!activeMembership) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'User is not associated with an organization' } },
        { status: 403 }
      );
    }
    const orgId = activeMembership.organizationId;

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER, HIRING_MANAGER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // Rate limit check for natural-language search
    const rateLimit = await checkRateLimit('SEARCH', `${orgId}:${userId}`);
    if (!rateLimit.success) {
      logger.warn(`Rate limit exceeded for candidate search by user: ${userId} in org: ${orgId}`, reqId);
      return buildRateLimit429Response(rateLimit);
    }

    // 5. Parse request body
    const body = await request.json().catch(() => ({}));
    const { query, jobId, similarToCandidateId, limit = 20, includeTerminal = false } = body;

    if (!query && !similarToCandidateId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Either query string or similarToCandidateId is required.' } },
        { status: 400 }
      );
    }

    const aiProvider = getAIProvider();
    if (!aiProvider) {
      logger.error('AI provider configuration is missing during candidate search', reqId);
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'AI Services are currently unavailable.' } },
        { status: 503 }
      );
    }

    // 6. Extract search intent using AIProvider
    let intent: CandidateSearchIntent = { query, limit };
    if (query) {
      try {
        const searchIntent = await aiProvider.parseCandidateSearchIntent(query);
        const intentValidation = CandidateSearchIntentSchema.safeParse(searchIntent);
        if (intentValidation.success) {
          intent = intentValidation.data;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to parse search intent via AI provider', reqId, { error: errMsg });
        // Fallback: search intent is empty structure with query
      }
    }

    // 7. Resolve similarity search vector
    let queryEmbedding: number[];
    if (similarToCandidateId) {
      // Find candidate X to clone search vector (strict tenant-scoped check)
      const candidateX = await db.query.candidates.findFirst({
        where: and(eq(candidates.id, similarToCandidateId), eq(candidates.organizationId, orgId)),
      });

      if (!candidateX) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Candidate similarity profile not found.' } },
          { status: 404 }
        );
      }

      const candidateXEmbedding = await db.query.candidateEmbeddings.findFirst({
        where: eq(candidateEmbeddings.candidateId, similarToCandidateId),
      });

      if (!candidateXEmbedding) {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: 'Similarity candidate has not been parsed/processed.' } },
          { status: 400 }
        );
      }

      queryEmbedding = candidateXEmbedding.embedding;
    } else {
      // Generate embedding of the raw NLP query
      try {
        queryEmbedding = await aiProvider.generateEmbedding(query);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to generate query embedding', reqId, { error: errMsg });
        return NextResponse.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'Failed to generate query embedding. Please try again.' } },
          { status: 503 }
        );
      }
    }

    // 8. Retrieve matching candidate pool
    const statuses = includeTerminal
      ? ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']
      : ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'];

    const matchedCandidates = await db
      .select({
        candidate: candidates,
        profile: candidateProfiles,
        distance: cosineDistance(candidateEmbeddings.embedding, queryEmbedding),
      })
      .from(candidates)
      .innerJoin(candidateProfiles, eq(candidateProfiles.candidateId, candidates.id))
      .innerJoin(candidateEmbeddings, eq(candidateEmbeddings.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.organizationId, orgId),
          inArray(candidates.status, statuses)
        )
      )
      .orderBy(cosineDistance(candidateEmbeddings.embedding, queryEmbedding))
      .limit(50); // Fetch top-N profiles for filtering and ranking

    // 9. Job Context Resolution (Mode B)
    let jobDetails: typeof jobs.$inferSelect | undefined;
    if (jobId) {
      jobDetails = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
      });
      if (!jobDetails) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
          { status: 404 }
        );
      }
    }

    // 10. Perform scoring & filtering in Node.js
    const results = [];
    for (const item of matchedCandidates) {
      const candidateProfile = item.profile as ExtractedProfile;
      const distance = item.distance as number | null;

      // Extract candidate details
      const candidateYears = calculateExperienceYears(candidateProfile.experience);

      // Apply intent structured filters
      if (intent.minimumExperienceYears !== undefined && intent.minimumExperienceYears !== null) {
        if (candidateYears < intent.minimumExperienceYears) continue;
      }
      if (intent.maximumExperienceYears !== undefined && intent.maximumExperienceYears !== null) {
        if (candidateYears > intent.maximumExperienceYears) continue;
      }

      let finalScore = 0;
      let scoreBreakdown: Record<string, unknown> = {};

      if (jobDetails) {
        // Mode B: Job-Specific matching scoring (weights: 35% semantic, 40% required, 15% preferred, 10% experience)
        const jobRequirements = jobDetails.requirements as JobRequirements;
        const scoring = calculateDetailedMatchScore(jobRequirements, candidateProfile, distance);
        finalScore = scoring.finalScore;
        scoreBreakdown = {
          semanticScore: scoring.semanticScore,
          requiredSkillsScore: scoring.requiredSkillsScore,
          preferredSkillsScore: scoring.preferredSkillsScore,
          experienceScore: scoring.experienceScore,
          matchedSkills: scoring.matchedSkills,
          missingSkills: scoring.missingSkills,
          matchedPreferred: scoring.matchedPreferred,
          missingPreferred: scoring.missingPreferred,
          experienceStatus: scoring.experienceStatus,
        };
      } else {
        // Mode A: General candidate search scoring (weights: 50% semantic, 40% skills, 10% experience alignment)
        const semanticScore = Math.max(0, Math.min(100, Math.round((1 - (distance ?? 1)) * 100)));

        const searchSkills = intent.requiredSkills || intent.skills || [];
        const candidateSkills = Array.isArray(candidateProfile.skills) ? candidateProfile.skills : [];
        const candidateSkillsNormalized = candidateSkills.map((s: { name: string } | string) =>
          normalizeSkillName(typeof s === 'string' ? s : s.name)
        );

        let skillScore = 100;
        const matchedSkills: string[] = [];
        const missingSkills: string[] = [];

        if (searchSkills.length > 0) {
          let matchedCount = 0;
          for (const skill of searchSkills) {
            const norm = normalizeSkillName(skill);
            if (candidateSkillsNormalized.includes(norm)) {
              matchedCount++;
              matchedSkills.push(skill);
            } else {
              missingSkills.push(skill);
            }
          }
          skillScore = Math.round((matchedCount / searchSkills.length) * 100);
        }

        let expScore = 100;
        let expStatus = 'Matched';
        if (intent.minimumExperienceYears !== undefined && intent.minimumExperienceYears !== null) {
          const minYears = intent.minimumExperienceYears;
          expScore = candidateYears >= minYears ? 100 : Math.round((candidateYears / minYears) * 100);
          expStatus = candidateYears >= minYears ? 'Matched' : 'Gap';
        }

        finalScore = Math.round(semanticScore * 0.50 + skillScore * 0.40 + expScore * 0.10);
        scoreBreakdown = {
          semanticScore,
          requiredSkillsScore: skillScore,
          preferredSkillsScore: 100,
          experienceScore: expScore,
          matchedSkills,
          missingSkills,
          matchedPreferred: [],
          missingPreferred: [],
          experienceStatus: expStatus,
        };
      }

      // Fetch candidate evidence mapping
      const candidateEvidences = await db.query.candidateEvidence.findMany({
        where: eq(candidateEvidence.candidateId, item.candidate.id),
      });

      const skillGroundingMap: Record<string, string> = {};
      for (const ev of candidateEvidences) {
        skillGroundingMap[normalizeSkillName(ev.skill)] = ev.excerpt;
      }

      // Expose evidence status mapping
      const matchingExplanations = [];
      for (const skill of (scoreBreakdown.matchedSkills as string[] || [])) {
        const norm = normalizeSkillName(skill);
        matchingExplanations.push({
          requirement: skill,
          status: 'Confirmed',
          evidence: skillGroundingMap[norm] || 'Found in parsed resume credentials.',
        });
      }
      for (const skill of (scoreBreakdown.missingSkills as string[] || [])) {
        matchingExplanations.push({
          requirement: skill,
          status: 'Not Found',
          evidence: 'Not Found in available candidate evidence.',
        });
      }

      results.push({
        candidate: {
          id: item.candidate.id,
          firstName: item.candidate.firstName,
          lastName: item.candidate.lastName,
          email: item.candidate.email,
          status: item.candidate.status,
          createdAt: item.candidate.createdAt,
        },
        match: {
          finalScore,
          candidateYears,
          ...scoreBreakdown,
          grounding: matchingExplanations,
        },
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.match.finalScore - a.match.finalScore);

    // Apply pagination server-side slice limit
    const pageLimit = Math.max(1, Math.min(50, limit));
    const paginatedResults = results.slice(0, pageLimit);

    logger.info(`Candidate natural language search completed (results: ${paginatedResults.length})`, reqId);

    return NextResponse.json({
      intent,
      candidates: paginatedResults,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to search candidates', reqId, { error: errMsg });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
