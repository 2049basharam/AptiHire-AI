import { NextResponse } from 'next/server';
import { db, candidates, candidateNotes, jobs, memberships, auditLogs, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { verifyCSRF } from '@/lib/csrf';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: candidateId } = await params;
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

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

    // 3. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Verify candidate organization isolation
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Query notes
    const conditions = [
      eq(candidateNotes.candidateId, candidateId),
      eq(candidateNotes.organizationId, orgId)
    ];
    if (jobId) {
      conditions.push(eq(candidateNotes.jobId, jobId));
    }

    const notes = await db.query.candidateNotes.findMany({
      where: and(...conditions),
      orderBy: [desc(candidateNotes.createdAt)],
      with: {
        author: {
          columns: {
            name: true,
            email: true,
          }
        }
      }
    });

    logger.info(`Candidate notes fetched successfully: ${candidateId} (count: ${notes.length})`, reqId);
    return NextResponse.json(notes);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get recruiter candidate notes', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: candidateId } = await params;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on notes creation request', reqId);
      return NextResponse.json(
        { error: { code: 'CSRF_ERROR', message: 'Forbidden. Cross-origin request blocked.' } },
        { status: 403 }
      );
    }

    // 2. Authenticate user
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

    // 3. Resolve organization ID
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

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 5. Verify candidate organization isolation
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 6. Validate input body
    const body = await request.json();
    const { jobId, content } = body;

    if (!jobId || !content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'jobId and non-empty content notes are required.' } },
        { status: 400 }
      );
    }

    // 7. Verify job organization isolation
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Associated job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    // 8. Insert notes
    const [newNote] = await db.insert(candidateNotes).values({
      organizationId: orgId,
      candidateId,
      jobId,
      authorUserId: userId,
      content: content.trim(),
    }).returning();

    // 9. Record audit log
    await db.insert(auditLogs).values({
      organizationId: orgId,
      userId,
      action: 'CANDIDATE_NOTE_CREATED',
      entityId: newNote.id,
      entityType: 'CANDIDATE_NOTE',
      details: { candidateId, jobId },
    });

    logger.info(`Candidate note created: ${newNote.id} by author: ${userId}`, reqId);
    return NextResponse.json(newNote, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create recruiter candidate note', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
