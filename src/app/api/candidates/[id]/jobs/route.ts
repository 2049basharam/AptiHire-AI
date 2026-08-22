import { NextResponse } from 'next/server';
import {
  db,
  candidates,
  candidateProfiles,
  candidateEmbeddings,
  jobs,
  jobEmbeddings,
  candidateEvidence,
  memberships,
  eq,
  and,
} from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/lib/ai/provider';
import { calculateDetailedMatchScore } from '@/lib/matching';
import { JobRequirements } from '@/lib/validations/job';
import { ExtractedProfile } from '@/lib/validations/candidate';
import { cosineDistance } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: candidateId } = await params;

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

    // 3. Verify RBAC permissions
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Retrieve candidate scoped strictly by organization ID
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Fetch candidate profile details
    const profile = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.candidateId, candidateId),
    });

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate profile details not found.' } },
        { status: 404 }
      );
    }

    // 6. Fetch candidate embedding
    const candidateEmbed = await db.query.candidateEmbeddings.findFirst({
      where: eq(candidateEmbeddings.candidateId, candidateId),
    });

    if (!candidateEmbed) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Candidate embedding unavailable. Reprocess the candidate profile before finding matching jobs.',
          },
        },
        { status: 400 }
      );
    }

    // 7. Perform semantic jobs retrieval scoped strictly by organization
    const matchedJobs = await db
      .select({
        job: jobs,
        distance: cosineDistance(jobEmbeddings.embedding, candidateEmbed.embedding),
      })
      .from(jobs)
      .innerJoin(jobEmbeddings, eq(jobEmbeddings.jobId, jobs.id))
      .where(
        and(
          eq(jobs.organizationId, orgId),
          eq(jobs.status, 'PUBLISHED')
        )
      )
      .orderBy(cosineDistance(jobEmbeddings.embedding, candidateEmbed.embedding))
      .limit(50);

    // 8. Fetch candidate evidence
    const evidenceList = await db.query.candidateEvidence.findMany({
      where: eq(candidateEvidence.candidateId, candidateId),
    });

    // 9. Calculate scoring
    const results = matchedJobs.map(({ job, distance }) => {
      const scoring = calculateDetailedMatchScore(
        job.requirements as JobRequirements,
        profile as ExtractedProfile,
        distance as number | null,
        evidenceList
      );
      return {
        job: {
          id: job.id,
          title: job.title,
          description: job.description,
          status: job.status,
          requirements: job.requirements,
          createdAt: job.createdAt,
        },
        match: scoring,
      };
    });

    // 10. Sort by deterministic tie-breakers (Score -> Semantic Distance -> Created Date -> ID)
    results.sort((a, b) => {
      if (b.match.finalScore !== a.match.finalScore) {
        return b.match.finalScore - a.match.finalScore;
      }
      if (b.match.semanticScore !== a.match.semanticScore) {
        return b.match.semanticScore - a.match.semanticScore;
      }
      const timeB = b.job.createdAt.getTime();
      const timeA = a.job.createdAt.getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return b.job.id.localeCompare(a.job.id);
    });

    // 11. Pagination/limits
    const url = new URL(request.url);
    const limitQuery = url.searchParams.get('limit');
    let limitValue = 10;
    if (limitQuery) {
      const parsed = parseInt(limitQuery, 10);
      if (!isNaN(parsed)) {
        limitValue = Math.max(1, Math.min(25, parsed));
      }
    }
    const paginatedResults = results.slice(0, limitValue);

    // 12. Add AI Match Explanation
    const aiProvider = getAIProvider();
    const finalResults = await Promise.all(
      paginatedResults.map(async (item) => {
        let explanation = {
          strongMatchesReason: `Strong alignment on: ${item.match.matchedSkills.join(', ') || 'None'}.`,
          gapsReason: `Potential gaps on: ${item.match.missingSkills.join(', ') || 'None'}.`,
          overallReason: `Candidate match score is ${item.match.finalScore}% based on skill coverage and profile similarity.`
        };

        if (aiProvider) {
          try {
            explanation = await aiProvider.generateMatchExplanation(
              item.job.title,
              item.job.requirements as JobRequirements,
              `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
              profile as ExtractedProfile,
              item.match
            );
          } catch (aiError: unknown) {
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            logger.warn('AI match explanation generation failed', reqId, { error: errMsg });
          }
        }

        return {
          ...item,
          explanation,
        };
      })
    );

    logger.info(`Candidate-to-job matching finished successfully for candidate ${candidateId} (count: ${finalResults.length})`, reqId);

    return NextResponse.json({
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
      },
      results: finalResults,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve candidate job matching results', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
