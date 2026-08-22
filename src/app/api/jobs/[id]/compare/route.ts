import { NextResponse } from 'next/server';
import {
  db,
  candidates,
  candidateEmbeddings,
  jobs,
  jobEmbeddings,
  memberships,
  eq,
  and,
} from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/lib/ai/provider';
import { calculateDetailedMatchScore, normalizeSkillName } from '@/lib/matching';
import { JobRequirements } from '@/lib/validations/job';
import { ExtractedProfile } from '@/lib/validations/candidate';
import { cosineDistance, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: jobId } = await params;

    // 1. Authenticate recruiter
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

    // 2. Resolve active membership & organization
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

    // 3. Verify RBAC permissions
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Verify job organization scoping
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Parse candidate IDs
    const { searchParams } = new URL(request.url);
    const candidatesParam = searchParams.get('candidates') || searchParams.get('candidateIds') || '';
    const candidateIds = candidatesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Validate count limit [2, 5]
    if (candidateIds.length < 2 || candidateIds.length > 5) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'You must select between 2 and 5 candidates to compare.' } },
        { status: 400 }
      );
    }

    // Validate duplicate IDs
    const uniqueIds = Array.from(new Set(candidateIds));
    if (uniqueIds.length !== candidateIds.length) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Duplicate candidate IDs are not allowed.' } },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const cid of candidateIds) {
      if (!uuidRegex.test(cid)) {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: `Invalid candidate ID format: ${cid}` } },
          { status: 400 }
        );
      }
    }

    // 6. Retrieve candidates scoped to the recruiter's organization and pipeline status
    const targetStatuses = [
      'APPROVED',
      'SHORTLISTED',
      'SCREENING',
      'INTERVIEW',
      'OFFER',
      'HIRED',
      'REJECTED',
      'WITHDRAWN',
    ];

    const dbCandidates = await db.query.candidates.findMany({
      where: and(
        eq(candidates.organizationId, orgId),
        inArray(candidates.id, candidateIds),
        inArray(candidates.status, targetStatuses)
      ),
      with: {
        profiles: true,
        evidence: true,
        embeddings: true,
      },
    });

    // Enforce that all candidates must exist and belong to the org
    if (dbCandidates.length !== candidateIds.length) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'One or more candidates not found or access denied.' } },
        { status: 404 }
      );
    }

    // 7. Load job embedding
    let jobEmbed = await db.query.jobEmbeddings.findFirst({
      where: and(eq(jobEmbeddings.jobId, jobId), eq(jobEmbeddings.organizationId, orgId)),
    });

    let jobEmbedValues: number[] | null = null;
    if (jobEmbed) {
      jobEmbedValues = jobEmbed.embedding;
    } else {
      const requirements = job.requirements as JobRequirements | null;
      const skills = Array.isArray(requirements?.skills) ? requirements.skills.join(', ') : '';
      const denseSummary = `Title: ${job.title}\nDescription: ${job.description}\nRequired Skills: ${skills}`;

      const aiProvider = getAIProvider();
      if (aiProvider) {
        try {
          jobEmbedValues = await aiProvider.generateEmbedding(denseSummary);
          const [newEmbed] = await db
            .insert(jobEmbeddings)
            .values({
              jobId,
              organizationId: orgId,
              embedding: jobEmbedValues,
              model: 'text-embedding-004',
              version: '1.0',
            })
            .returning();
          jobEmbed = newEmbed;
        } catch (embedError) {
          logger.warn('Failed to dynamically generate job embedding in candidate comparison', reqId, { error: embedError });
        }
      }
    }

    // 8. Fetch distance programmatically using pgvector for each candidate
    const distances = await Promise.all(
      candidateIds.map(async (cid) => {
        if (!jobEmbedValues) return null;
        const queryResult = await db
          .select({
            distance: cosineDistance(candidateEmbeddings.embedding, jobEmbedValues),
          })
          .from(candidateEmbeddings)
          .where(eq(candidateEmbeddings.candidateId, cid))
          .limit(1);
        return queryResult.length > 0 ? (queryResult[0].distance as number) : null;
      })
    );

    // 9. Run matching calculation
    const candidatesCompareData = dbCandidates.map((cand) => {
      const profile = cand.profiles?.[0] || null;
      const distanceIndex = candidateIds.indexOf(cand.id);
      const distance = distances[distanceIndex] ?? null;

      const scoring = calculateDetailedMatchScore(
        job.requirements as JobRequirements,
        profile as ExtractedProfile,
        distance,
        cand.evidence || []
      );

      // Score Contribution Breakdowns
      const semanticContribution = Math.round(scoring.semanticScore * 0.35 * 100) / 100;
      const requiredSkillsContribution = Math.round(scoring.requiredSkillsScore * 0.4 * 100) / 100;
      const preferredSkillsContribution = Math.round(scoring.preferredSkillsScore * 0.15 * 100) / 100;
      const experienceContribution = Math.round(scoring.experienceScore * 0.1 * 100) / 100;

      // Map required and preferred skills side by side
      const requirements = job.requirements as JobRequirements | null;
      const requiredSkillsList = requirements?.skills || [];
      const preferredSkillsList = requirements?.qualifications || [];

      const skillsMap = requiredSkillsList.map((skillName) => {
        const norm = normalizeSkillName(skillName);
        const isMatched = scoring.matchedSkills.find((s) => normalizeSkillName(s) === norm);
        const ev = cand.evidence?.find((e) => normalizeSkillName(e.skill) === norm);
        return {
          name: skillName,
          category: 'required',
          status: isMatched ? 'CONFIRMED' : 'NOT_FOUND',
          evidence: isMatched && ev ? ev.excerpt : null,
        };
      }).concat(
        preferredSkillsList.map((skillName) => {
          const norm = normalizeSkillName(skillName);
          const isMatched = scoring.matchedPreferred.find((s) => normalizeSkillName(s) === norm);
          const ev = cand.evidence?.find((e) => normalizeSkillName(e.skill) === norm);
          return {
            name: skillName,
            category: 'preferred',
            status: isMatched ? 'CONFIRMED' : 'NOT_FOUND',
            evidence: isMatched && ev ? ev.excerpt : null,
          };
        })
      );

      return {
        id: cand.id,
        name: cand.firstName && cand.lastName ? `${cand.firstName} ${cand.lastName}` : `Candidate #${cand.id.substring(0, 8)}`,
        status: cand.status,
        match: {
          finalScore: scoring.finalScore,
          semanticScore: scoring.semanticScore,
          requiredSkillsScore: scoring.requiredSkillsScore,
          preferredSkillsScore: scoring.preferredSkillsScore,
          experienceScore: scoring.experienceScore,
          contributions: {
            semantic: semanticContribution,
            requiredSkills: requiredSkillsContribution,
            preferredSkills: preferredSkillsContribution,
            experience: experienceContribution,
          },
        },
        skills: skillsMap,
        experience: {
          years: scoring.candidateYears,
          requiredLevel: requirements?.experienceLevel || 'None',
          alignment: scoring.experienceStatus,
        },
      };
    });

    // Maintain query parameter sorting order
    candidatesCompareData.sort((a, b) => candidateIds.indexOf(a.id) - candidateIds.indexOf(b.id));

    // 10. Optional AI comparison summary
    const aiProvider = getAIProvider();
    let aiSummary: string | null = null;

    if (aiProvider) {
      const factualCompareData = candidatesCompareData.map((c) => ({
        name: c.name,
        finalScore: c.match.finalScore,
        semanticScore: c.match.semanticScore,
        requiredSkillsScore: c.match.requiredSkillsScore,
        preferredSkillsScore: c.match.preferredSkillsScore,
        experienceScore: c.match.experienceScore,
        confirmedSkills: c.skills.filter((s) => s.status === 'CONFIRMED').map((s) => s.name),
        notFoundSkills: c.skills.filter((s) => s.status === 'NOT_FOUND').map((s) => s.name),
        experienceYears: c.experience.years,
        experienceAlignment: c.experience.alignment,
      }));

      try {
        aiSummary = await aiProvider.generateCandidateComparisonSummary(
          job.title,
          job.requirements as JobRequirements,
          factualCompareData
        );
      } catch (aiError: unknown) {
        const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
        logger.warn('AI comparison summary generation failed in route', reqId, { error: errMsg });
      }
    }

    logger.info(`Candidate comparison compiled successfully for jobId ${jobId} (candidates: ${candidatesCompareData.length})`, reqId);

    return NextResponse.json({
      job: {
        id: job.id,
        title: job.title,
      },
      candidates: candidatesCompareData,
      aiSummary,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to compare candidates', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
