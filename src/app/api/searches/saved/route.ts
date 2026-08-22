import { NextResponse } from 'next/server';
import { db, savedSearches } from '@/db';
import { desc } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { CandidateSearchIntentSchema } from '@/lib/validations/search';
import { createObservabilityTracker } from '@/lib/observability';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  query: z.string().min(1, 'Query is required'),
  intentJson: CandidateSearchIntentSchema,
});

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/searches/saved');
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

    const searches = await db.query.savedSearches.findMany({
      where: (s, { and, eq }) => and(eq(s.organizationId, organizationId), eq(s.userId, userId)),
      orderBy: [desc(savedSearches.createdAt)],
    });

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: searches }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch saved searches', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch saved searches' } }, { status: 500 }));
  }
}

export async function POST(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/searches/saved');
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
    const parseResult = CreateSavedSearchSchema.safeParse(body);
    if (!parseResult.success) {
      tracker.finish(400);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid saved search parameters', details: parseResult.error.format() } }, { status: 400 }));
    }

    const [saved] = await db.insert(savedSearches).values({
      organizationId,
      userId,
      name: parseResult.data.name,
      query: parseResult.data.query,
      intentJson: parseResult.data.intentJson,
    }).returning();

    tracker.finish(201);
    return tracker.withRequestId(NextResponse.json({ data: saved }, { status: 201 }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create saved search', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save search' } }, { status: 500 }));
  }
}
