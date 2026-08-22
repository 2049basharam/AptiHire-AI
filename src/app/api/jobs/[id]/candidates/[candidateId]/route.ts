import { NextResponse } from 'next/server';
import { db, jobs, candidates, candidateProfiles, candidateEmbeddings, jobEmbeddings, candidateEvidence, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { getAIProvider } from '@/lib/ai/provider';
import { calculateDetailedMatchScore } from '@/lib/matching';
import { logger } from '@/lib/logger';
import { JobRequirements } from '@/lib/validations/job';
import { ExtractedProfile } from '@/lib/validations/candidate';
import { cosineDistance } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: jobId, candidateId } = await params;

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

    // 5. Retrieve candidate scoped strictly by organization ID
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 6. Fetch candidate profile
    const profile = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.candidateId, candidateId),
    });

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate profile details not found.' } },
        { status: 404 }
      );
    }

    // 7. Retrieve or dynamically generate job embedding
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

    // 8. Fetch candidate embedding
    const candidateEmbed = await db.query.candidateEmbeddings.findFirst({
      where: eq(candidateEmbeddings.candidateId, candidateId),
    });

    let distance: number | null = null;
    if (candidateEmbed) {
      // Calculate distance query value
      const queryResult = await db.select({
        distance: cosineDistance(candidateEmbeddings.embedding, jobEmbed.embedding)
      })
      .from(candidateEmbeddings)
      .where(eq(candidateEmbeddings.candidateId, candidateId))
      .limit(1);
      
      if (queryResult.length > 0) {
        distance = queryResult[0].distance as number;
      }
    }

    // 9. Fetch candidate evidence for verbatim grounding excerpts
    const evidenceList = await db.query.candidateEvidence.findMany({
      where: eq(candidateEvidence.candidateId, candidateId),
    });

    // 10. Calculate deterministic score breakdown
    const scoring = calculateDetailedMatchScore(
      job.requirements as JobRequirements,
      profile as ExtractedProfile,
      distance,
      evidenceList
    );

    // 10. Generate optional AI explanation
    const aiProvider = getAIProvider();
    let explanation = {
      strongMatchesReason: `Strong alignment on: ${scoring.matchedSkills.join(', ') || 'None'}.`,
      gapsReason: `Potential gaps on: ${scoring.missingSkills.join(', ') || 'None'}.`,
      overallReason: `Candidate match score is ${scoring.finalScore}% based on skill coverage and profile similarity.`
    };

    if (aiProvider) {
      try {
        explanation = await aiProvider.generateMatchExplanation(
          job.title,
          job.requirements as JobRequirements,
          `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
          profile as ExtractedProfile,
          scoring
        );
      } catch (aiError: unknown) {
        const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
        logger.warn('AI explanation generation failed, falling back to deterministic summary', reqId, { error: errMsg });
      }
    }

    logger.info(`Detailed candidate-job match generated successfully for job ${jobId} and candidate ${candidateId}`, reqId);
    return NextResponse.json({
      jobId,
      candidateId,
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        status: candidate.status,
      },
      match: scoring,
      explanation
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get detailed candidate match', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
