import { NextResponse } from 'next/server';
import { db, tags } from '@/db';
import { asc } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(100),
  color: z.string().max(30).optional().default('blue'),
});

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/tags');
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

    const tagList = await db.query.tags.findMany({
      where: (t, { eq }) => eq(t.organizationId, organizationId),
      orderBy: [asc(tags.name)],
    });

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: tagList }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch organization tags', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tags' } }, { status: 500 }));
  }
}

export async function POST(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/tags');
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

    const body = await req.json().catch(() => ({}));
    const parseResult = CreateTagSchema.safeParse(body);
    if (!parseResult.success) {
      tracker.finish(400);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid tag parameter', details: parseResult.error.format() } }, { status: 400 }));
    }

    const normalizedName = parseResult.data.name.trim().toLowerCase();

    // Check if tag already exists in organization
    const existing = await db.query.tags.findFirst({
      where: (t, { and, eq }) => and(eq(t.organizationId, organizationId), eq(t.name, normalizedName)),
    });

    if (existing) {
      tracker.finish(200);
      return tracker.withRequestId(NextResponse.json({ data: existing }));
    }

    const [created] = await db.insert(tags).values({
      organizationId,
      name: normalizedName,
      color: parseResult.data.color || 'blue',
    }).returning();

    tracker.finish(201);
    return tracker.withRequestId(NextResponse.json({ data: created }, { status: 201 }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create tag', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create tag' } }, { status: 500 }));
  }
}
