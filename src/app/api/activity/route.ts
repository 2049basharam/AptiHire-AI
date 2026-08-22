import { NextResponse } from 'next/server';
import { db, sql } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/activity');
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

    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');
    const jobId = searchParams.get('jobId');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const cursorCreatedAt = searchParams.get('cursorCreatedAt');
    const cursorId = searchParams.get('cursorId');

    // Rate limiting check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    let candidateFilter = sql``;
    if (candidateId) {
      candidateFilter = sql`AND candidate_id = ${candidateId}`;
    }

    let jobFilter = sql``;
    if (jobId) {
      jobFilter = sql`AND job_id = ${jobId}`;
    }

    let cursorFilter = sql``;
    if (cursorCreatedAt && cursorId) {
      cursorFilter = sql`AND (ua.created_at, ua.id) < (${cursorCreatedAt}::timestamp, ${cursorId}::uuid)`;
    }

    const query = sql`
      WITH unified_activity AS (
        SELECT
          'STATUS_CHANGE' AS type,
          id,
          candidate_id,
          job_id,
          actor_user_id AS user_id,
          new_status AS details,
          created_at
        FROM candidate_status_history
        WHERE organization_id = ${organizationId} ${candidateFilter} ${jobFilter}
        
        UNION ALL
        
        SELECT
          'NOTE_ADDED' AS type,
          id,
          candidate_id,
          job_id,
          author_user_id AS user_id,
          content AS details,
          created_at
        FROM candidate_notes
        WHERE organization_id = ${organizationId} ${candidateFilter} ${jobFilter}
      )
      SELECT
        ua.type,
        ua.id,
        ua.candidate_id,
        ua.job_id,
        ua.user_id,
        ua.details,
        ua.created_at,
        u.name AS user_name,
        c.first_name AS candidate_first_name,
        c.last_name AS candidate_last_name,
        j.title AS job_title
      FROM unified_activity ua
      LEFT JOIN users u ON u.id = ua.user_id
      LEFT JOIN candidates c ON c.id = ua.candidate_id
      LEFT JOIN jobs j ON j.id = ua.job_id
      WHERE 1=1 ${cursorFilter}
      ORDER BY ua.created_at DESC, ua.id DESC
      LIMIT ${limit + 1}
    `;

    const result = await db.execute(query);
    const rows = result.rows as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = hasMore && items.length > 0 ? {
      createdAt: items[items.length - 1].created_at,
      id: items[items.length - 1].id,
    } : null;

    const formattedActivities = items.map((row) => ({
      type: row.type,
      id: row.id,
      candidateId: row.candidate_id,
      candidateName: row.candidate_first_name ? `${row.candidate_first_name} ${row.candidate_last_name}` : 'Unknown Candidate',
      jobId: row.job_id,
      jobTitle: row.job_title || null,
      userId: row.user_id,
      userName: row.user_name || 'System User',
      details: row.details,
      createdAt: row.created_at,
    }));

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({
      data: {
        items: formattedActivities,
        nextCursor,
        hasMore,
      },
    }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch activity feed', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve activity feed' } }, { status: 500 }));
  }
}
