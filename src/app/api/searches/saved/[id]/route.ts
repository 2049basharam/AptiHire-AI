import { NextResponse } from 'next/server';
import { db, savedSearches, eq, and } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/searches/saved/[id]');
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

    const [deleted] = await db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.organizationId, organizationId), eq(savedSearches.userId, userId)))
      .returning();

    if (!deleted) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Saved search not found or access denied' } }, { status: 404 }));
    }

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: { id: deleted.id, deleted: true } }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to delete saved search', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete saved search' } }, { status: 500 }));
  }
}
