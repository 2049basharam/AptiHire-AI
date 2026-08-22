import { NextResponse } from 'next/server';
import { db, sql } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const STAGE_SLAS_DAYS: Record<string, number> = {
  UPLOADED: 2,
  REVIEW_REQUIRED: 2,
  APPROVED: 3,
  SHORTLISTED: 5,
  SCREENING: 7,
  INTERVIEW: 10,
  OFFER: 5,
};

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/analytics/dashboard');
  try {
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

    // Rate limiting check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    // 1. Stage Counts & Overall Candidate Metrics via PostgreSQL aggregation
    const candidateStatsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_candidates,
        COUNT(*) FILTER (WHERE status = 'UPLOADED')::int AS uploaded_count,
        COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::int AS review_required_count,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_count,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_count,
        COUNT(*) FILTER (WHERE status = 'SHORTLISTED')::int AS shortlisted_count,
        COUNT(*) FILTER (WHERE status = 'SCREENING')::int AS screening_count,
        COUNT(*) FILTER (WHERE status = 'INTERVIEW')::int AS interview_count,
        COUNT(*) FILTER (WHERE status = 'OFFER')::int AS offer_count,
        COUNT(*) FILTER (WHERE status = 'HIRED')::int AS hired_count
      FROM candidates
      WHERE organization_id = ${organizationId}
    `);

    const stats = (candidateStatsResult.rows[0] as Record<string, unknown>) || {};
    const totalCandidates = (stats.total_candidates as number) || 0;
    const hiredCount = (stats.hired_count as number) || 0;
    const interviewCount = (stats.interview_count as number) || 0;
    const offerCount = (stats.offer_count as number) || 0;

    const conversionMetrics = {
      overallHiredRate: totalCandidates > 0 ? Math.round((hiredCount / totalCandidates) * 100) : 0,
      interviewToOfferRate: interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : 0,
      offerToHiredRate: offerCount > 0 ? Math.round((hiredCount / offerCount) * 100) : 0,
    };

    // 2. Published Jobs Count
    const jobsCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS active_jobs FROM jobs WHERE organization_id = ${organizationId} AND status = 'PUBLISHED'
    `);
    const activeJobs = ((jobsCountResult.rows[0] as Record<string, unknown>)?.active_jobs as number) || 0;

    // 3. Time-in-Stage & Aging Calculations using LEAD() window function
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
          END AS duration_days,
          CASE WHEN LEAD(csh.created_at) OVER (PARTITION BY csh.candidate_id ORDER BY csh.created_at ASC) IS NULL THEN TRUE ELSE FALSE END AS is_current
        FROM candidate_status_history csh
        WHERE csh.organization_id = ${organizationId}
      )
      SELECT
        stage,
        COUNT(*)::int AS transitions_count,
        ROUND(AVG(duration_days)::numeric, 1)::float AS avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_days)::numeric, 1)::float AS median_days,
        COUNT(*) FILTER (WHERE is_current = TRUE)::int AS current_active_count
      FROM stage_durations
      GROUP BY stage
      ORDER BY stage ASC
    `);

    const stageMetrics = (timeInStageResult.rows as Record<string, unknown>[]).map((row) => ({
      stage: row.stage as string,
      transitionsCount: row.transitions_count as number,
      avgDays: (row.avg_days as number) || 0,
      medianDays: (row.median_days as number) || 0,
      currentActiveCount: (row.current_active_count as number) || 0,
      slaThresholdDays: STAGE_SLAS_DAYS[row.stage as string] || 7,
    }));

    // 4. Aging Candidates exceeding stage SLAs
    const agingCandidatesResult = await db.execute(sql`
      WITH current_stages AS (
        SELECT DISTINCT ON (csh.candidate_id)
          csh.candidate_id,
          c.first_name,
          c.last_name,
          csh.new_status AS current_stage,
          csh.created_at AS entered_stage_at,
          EXTRACT(EPOCH FROM (NOW() - csh.created_at)) / 86400.0 AS days_in_stage
        FROM candidate_status_history csh
        JOIN candidates c ON c.id = csh.candidate_id
        WHERE csh.organization_id = ${organizationId} AND c.status NOT IN ('REJECTED', 'HIRED', 'WITHDRAWN')
        ORDER BY csh.candidate_id, csh.created_at DESC
      )
      SELECT
        candidate_id,
        first_name,
        last_name,
        current_stage,
        ROUND(days_in_stage::numeric, 1)::float AS days_in_stage
      FROM current_stages
      WHERE days_in_stage > 2.0
      ORDER BY days_in_stage DESC
      LIMIT 10
    `);

    const agingCandidates = (agingCandidatesResult.rows as Record<string, unknown>[]).map((row) => ({
      candidateId: row.candidate_id as string,
      name: `${row.first_name} ${row.last_name}`,
      stage: row.current_stage as string,
      daysInStage: row.days_in_stage as number,
      exceedsSLA: (row.days_in_stage as number) > (STAGE_SLAS_DAYS[row.current_stage as string] || 5),
    }));

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({
      data: {
        summary: {
          totalCandidates,
          activeJobs,
          hiredCount,
          overallHiredRate: conversionMetrics.overallHiredRate,
        },
        funnel: {
          uploaded: stats.uploaded_count || 0,
          reviewRequired: stats.review_required_count || 0,
          approved: stats.approved_count || 0,
          shortlisted: stats.shortlisted_count || 0,
          screening: stats.screening_count || 0,
          interview: stats.interview_count || 0,
          offer: stats.offer_count || 0,
          hired: stats.hired_count || 0,
          rejected: stats.rejected_count || 0,
        },
        conversion: conversionMetrics,
        timeInStage: stageMetrics,
        agingCandidates,
      },
    }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch dashboard analytics', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve analytics data' } }, { status: 500 }));
  }
}
