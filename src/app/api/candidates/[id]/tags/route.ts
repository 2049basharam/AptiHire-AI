import { NextResponse } from 'next/server';
import { db, candidateTags, eq, and } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import { createObservabilityTracker } from '@/lib/observability';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const AttachTagSchema = z.object({
  tagId: z.string().uuid('Invalid tag ID format'),
});

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/candidates/[id]/tags');
  try {
    const { id: candidateId } = await props.params;
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

    // Check candidate ownership
    const candidate = await db.query.candidates.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, candidateId), eq(c.organizationId, organizationId)),
    });

    if (!candidate) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Candidate profile not found' } }, { status: 404 }));
    }

    // Rate limit check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    const assigned = await db.query.candidateTags.findMany({
      where: (ct, { and, eq }) => and(eq(ct.candidateId, candidateId), eq(ct.organizationId, organizationId)),
      with: {
        tag: true,
      },
    });

    const tagsList = assigned.map((item) => item.tag);

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: tagsList }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to fetch candidate tags', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch candidate tags' } }, { status: 500 }));
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/candidates/[id]/tags');
  try {
    const { id: candidateId } = await props.params;
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

    // Check candidate ownership
    const candidate = await db.query.candidates.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, candidateId), eq(c.organizationId, organizationId)),
    });

    if (!candidate) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Candidate profile not found' } }, { status: 404 }));
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = AttachTagSchema.safeParse(body);
    if (!parseResult.success) {
      tracker.finish(400);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid tag parameter', details: parseResult.error.format() } }, { status: 400 }));
    }
    const { tagId } = parseResult.data;

    // Check tag ownership
    const tag = await db.query.tags.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, tagId), eq(t.organizationId, organizationId)),
    });

    if (!tag) {
      tracker.finish(404);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Tag not found' } }, { status: 404 }));
    }

    // Upsert mapping
    const existing = await db.query.candidateTags.findFirst({
      where: (ct, { and, eq }) => and(eq(ct.candidateId, candidateId), eq(ct.tagId, tagId)),
    });

    if (!existing) {
      await db.insert(candidateTags).values({
        organizationId,
        candidateId,
        tagId,
      });
    }

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: { candidateId, tagId, attached: true } }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to attach tag to candidate', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to attach tag' } }, { status: 500 }));
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const tracker = createObservabilityTracker(req, '/api/candidates/[id]/tags');
  try {
    const { id: candidateId } = await props.params;
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
    const tagId = searchParams.get('tagId');

    if (!tagId) {
      tracker.finish(400);
      return tracker.withRequestId(NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'tagId query parameter is required' } }, { status: 400 }));
    }

    // Rate limit check
    const rateLimit = await checkRateLimit('GENERAL', `${organizationId}:${userId}`);
    if (!rateLimit.success) {
      tracker.finish(429);
      return tracker.withRequestId(buildRateLimit429Response(rateLimit));
    }

    await db.delete(candidateTags)
      .where(and(
        eq(candidateTags.candidateId, candidateId),
        eq(candidateTags.tagId, tagId),
        eq(candidateTags.organizationId, organizationId)
      ));

    tracker.finish(200);
    return tracker.withRequestId(NextResponse.json({ data: { candidateId, tagId, detached: true } }));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to detach tag from candidate', tracker.requestId, { error: errMsg });
    tracker.finish(500);
    return tracker.withRequestId(NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to detach tag' } }, { status: 500 }));
  }
}
