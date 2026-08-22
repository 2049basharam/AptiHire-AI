import { NextResponse } from 'next/server';
import { db, jobs, candidates, candidateProfiles, candidateEmbeddings, jobEmbeddings, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { calculateDetailedMatchScore } from '@/lib/matching';
import { cosineDistance, inArray } from 'drizzle-orm';
import { JobRequirements } from '@/lib/validations/job';
import { ExtractedProfile } from '@/lib/validations/candidate';
import { getAIProvider } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: jobId } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const statusFilter = searchParams.get('status');
    const minScore = searchParams.get('minScore') ? parseInt(searchParams.get('minScore') || '0', 10) : null;
    const maxScore = searchParams.get('maxScore') ? parseInt(searchParams.get('maxScore') || '100', 10) : null;

    // 1. Authenticate user
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

    // 2. Resolve organization ID
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

    // 3. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Verify job organization isolation
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Retrieve or generate job embedding vector
    let jobEmbed = await db.query.jobEmbeddings.findFirst({
      where: and(eq(jobEmbeddings.jobId, jobId), eq(jobEmbeddings.organizationId, orgId)),
    });

    if (!jobEmbed) {
      // Generate job description summary for embedding input
      const skills = (job.requirements as JobRequirements | null)?.skills?.join(', ') || '';
      const denseSummary = `Title: ${job.title}\nDescription: ${job.description}\nRequired Skills: ${skills}`;

      // Call AI provider
      const aiProvider = getAIProvider();
      if (!aiProvider) {
        return NextResponse.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'AI Provider is not configured' } },
          { status: 503 }
        );
      }

      const vectorValues = await aiProvider.generateEmbedding(denseSummary);
      const [newEmbed] = await db.insert(jobEmbeddings).values({
        jobId,
        organizationId: orgId,
        embedding: vectorValues,
        model: 'text-embedding-004',
        version: '1.0',
      }).returning();
      
      jobEmbed = newEmbed;
    }

    // 6. Retrieve organization candidates matching all active and historical pipeline statuses
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

    const matchedCandidates = await db
      .select({
        candidate: candidates,
        profile: candidateProfiles,
        distance: cosineDistance(candidateEmbeddings.embedding, jobEmbed.embedding),
      })
      .from(candidates)
      .innerJoin(candidateProfiles, eq(candidateProfiles.candidateId, candidates.id))
      .innerJoin(candidateEmbeddings, eq(candidateEmbeddings.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.organizationId, orgId),
          inArray(candidates.status, targetStatuses)
        )
      )
      .orderBy(cosineDistance(candidateEmbeddings.embedding, jobEmbed.embedding));

    // 7. Calculate detailed match breakdown, scores, and filter results
    const results = matchedCandidates
      .map(({ candidate, profile, distance }) => {
        const scoring = calculateDetailedMatchScore(
          job.requirements as JobRequirements,
          profile as ExtractedProfile,
          distance as number | null
        );
        return {
          candidate: {
            id: candidate.id,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email,
            phone: candidate.phone,
            status: candidate.status,
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt,
          },
          match: {
            finalScore: scoring.finalScore,
            semanticScore: scoring.semanticScore,
            requiredSkillsScore: scoring.requiredSkillsScore,
            preferredSkillsScore: scoring.preferredSkillsScore,
            experienceScore: scoring.experienceScore,
            experienceStatus: scoring.experienceStatus,
            candidateYears: scoring.candidateYears,
            matchedSkills: scoring.matchedSkills,
            missingSkills: scoring.missingSkills,
            matchedPreferred: scoring.matchedPreferred,
            missingPreferred: scoring.missingPreferred,
            skillGroundingMap: scoring.skillGroundingMap,
          },
        };
      })
      .filter((item) => {
        // Apply status filter
        if (statusFilter && item.candidate.status !== statusFilter) {
          return false;
        }

        // Apply score range filter
        if (minScore !== null && item.match.finalScore < minScore) {
          return false;
        }
        if (maxScore !== null && item.match.finalScore > maxScore) {
          return false;
        }

        // Apply search keyword filter
        if (search) {
          const term = search.toLowerCase();
          const fullName = `${item.candidate.firstName || ''} ${item.candidate.lastName || ''}`.toLowerCase();
          const email = (item.candidate.email || '').toLowerCase();
          if (!fullName.includes(term) && !email.includes(term)) {
            return false;
          }
        }

        return true;
      });

    logger.info(`Job pipeline retrieval completed for job ${jobId} (results: ${results.length})`, reqId);
    return NextResponse.json(results);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get job pipeline candidates list', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
