import { NextResponse } from 'next/server';
import { db, sql } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/analytics/jobs/[id]');
  try {
    const { id: jobId } = await props.params;
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch {
      tracker.finish(401);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 }));
    }

    const activeMembership = await db.query.memberships.findFirst({
      where: (m, { eq }) => eq(m.userId, userId),
    });

    if (!activeMembership) {
      tracker.finish(403);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'FORBIDDEN', message: 'User is not associated with an organization' } }, { status: 403 }));
    }
    const organizationId = activeMembership.organizationId;

    // Check job ownership
    const job = await db.query.jobs.findFirst({
      where: (jobs, { eq, and }) => and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)),
    });

    if (!job) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, { status: 404 }));
    }

    // Rate limit check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    // 1. Stage Counts for Job
    const stageCountsResult = await db.execute(sql`
      SELECT
        csh.new_status AS status,
        COUNT(DISTINCT csh.candidate_id)::int AS count
      FROM candidate_status_history csh
      WHERE csh.organization_id = ${organizationId} AND csh.job_id = ${jobId}
      GROUP BY csh.new_status
    `);

    const stageMap: Record<string, number> = {};
    (stageCountsResult.rows as Record<string, unknown>[]).forEach((row) => {
      stageMap[row.status as string] = row.count as number;
    });

    // 2. Job Time-in-stage
    const timeInStageResult = await db.execute(sql`
      WITH stage_durations AS (
        SELECT
          csh.new_status AS stage,
          csh.candidate_id,
          csh.created_at AS transition_time,
          LEAD(csh.created_at) OVER (PARTITION BY csh.candidate_id ORDER BY csh.created_at ASC) AS next_transition_time,
          CASE
            WHEN LEAD(csh.created_at) OVER (PARTITION BY csh.candidate_id ORDER BY csh.created_at ASC) IS NOT NULL THEN
              EXTRACT(EPOCH FROM (LEAD(csh.created_at) OVER (PARTITION BY csh.candidate_id ORDER BY csh.created_at ASC) - csh.created_at)) / 86400.0
            ELSE
              EXTRACT(EPOCH FROM (NOW() - csh.created_at)) / 86400.0
          END AS duration_days
        FROM candidate_status_history csh
        WHERE csh.organization_id = ${organizationId} AND csh.job_id = ${jobId}
      )
      SELECT
        stage,
        COUNT(*)::int AS total_candidates,
        ROUND(AVG(duration_days)::numeric, 1)::float AS avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_days)::numeric, 1)::float AS median_days
      FROM stage_durations
      GROUP BY stage
    `);

    const stageMetrics = (timeInStageResult.rows as Record<string, unknown>[]).map((row) => ({
      stage: row.stage as string,
      totalCandidates: row.total_candidates as number,
      avgDays: (row.avg_days as number) || 0,
      medianDays: (row.median_days as number) || 0,
    }));

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({
      data: {
        job: {
          id: job.id,
          title: job.title,
          status: job.status,
          createdAt: job.createdAt,
        },
        funnel: {
          uploaded: stageMap.UPLOADED || 0,
          reviewRequired: stageMap.REVIEW_REQUIRED || 0,
          approved: stageMap.APPROVED || 0,
          shortlisted: stageMap.SHORTLISTED || 0,
          screening: stageMap.SCREENING || 0,
          interview: stageMap.INTERVIEW || 0,
          offer: stageMap.OFFER || 0,
          hired: stageMap.HIRED || 0,
          rejected: stageMap.REJECTED || 0,
        },
        timeInStage: stageMetrics,
      },
    }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch job analytics', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve job analytics' } }, { status: 500 }));
  }
}
