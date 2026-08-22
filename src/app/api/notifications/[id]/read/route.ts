import { NextResponse } from 'next/server';
import { db, notifications, eq, and } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/notifications/[id]/read');
  try {
    const { id } = await props.params;
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

    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.organizationId, organizationId),
        eq(notifications.recipientUserId, userId)
      ))
      .returning();

    if (!updated) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Notification not found or access denied' } }, { status: 404 }));
    }

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: { id: updated.id, read: true } }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to mark notification as read', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to mark notification as read' } }, { status: 500 }));
  }
}
