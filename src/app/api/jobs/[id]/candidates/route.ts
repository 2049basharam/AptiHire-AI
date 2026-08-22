import { NextResponse } from 'next/server';
import { db, jobs, candidates, candidateProfiles, candidateEmbeddings, jobEmbeddings, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { getAIProvider } from '@/lib/ai/provider';
import { calculateDetailedMatchScore } from '@/lib/matching';
import { logger } from '@/lib/logger';
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
    const jobId = (await params).id;

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

    // 4. Retrieve job scoped strictly by organization ID
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Retrieve or dynamically generate job embedding
    let jobEmbed = await db.query.jobEmbeddings.findFirst({
      where: eq(jobEmbeddings.jobId, jobId),
    });

    if (!jobEmbed) {
      logger.info(`Job embedding not found. Generating on-the-fly for job ${jobId}`, reqId);
      const requirements = job.requirements as JobRequirements | null;
      const skills = Array.isArray(requirements?.skills)
        ? requirements.skills.join(', ')
        : '';
      const denseSummary = `Title: ${job.title}\nDescription: ${job.description}\nRequired Skills: ${skills}`;

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

    // 6. Perform semantic candidate retrieval scoped strictly by organization
    // Cosine distance maps to <=> operator in PostgreSQL
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
          inArray(candidates.status, ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'])
        )
      )
      .orderBy(cosineDistance(candidateEmbeddings.embedding, jobEmbed.embedding))
      .limit(50);

    // 7. Calculate detailed match breakdown and final scores
    const results = matchedCandidates.map(({ candidate, profile, distance }) => {
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
        }
      };
    });

    // 8. Sort candidates by final score descending
    results.sort((a, b) => b.match.finalScore - a.match.finalScore);

    logger.info(`Ranked candidate matching retrieval completed for job ${jobId} (results: ${results.length})`, reqId);
    return NextResponse.json({ candidates: results });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get ranked candidates', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
