import { NextResponse } from 'next/server';
import { db, notifications, sql } from '@/db';
import { desc } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/notifications');
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

    // Rate limit check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    const notifList = await db.query.notifications.findMany({
      where: (n, { and, eq }) => and(eq(n.organizationId, organizationId), eq(n.recipientUserId, userId)),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });

    const unreadCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS unread_count FROM notifications
      WHERE organization_id = ${organizationId} AND recipient_user_id = ${userId} AND read = FALSE
    `);

    const unreadCount = ((unreadCountResult.rows[0] as Record<string, unknown>)?.unread_count as number) || 0;

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({
      data: {
        notifications: notifList,
        unreadCount,
      },
    }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch notifications', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' } }, { status: 500 }));
  }
}
