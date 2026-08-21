import { NextResponse } from 'next/server';
import { db, candidates, candidateDocuments, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { addCandidateJob, startCandidateWorker } from '@/services/queue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id } = await params;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on candidate processing retry', reqId);
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

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed to retry)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 5. Retrieve candidate and verify tenant scope
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, id), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 6. Fetch candidate document details
    const doc = await db.query.candidateDocuments.findFirst({
      where: eq(candidateDocuments.candidateId, id),
    });

    if (!doc) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No document associated with candidate to retry parsing.' } },
        { status: 400 }
      );
    }

    // 7. Update status to QUEUED and save retry audit log in transaction
    await db.transaction(async (tx) => {
      await tx.update(candidates)
        .set({ status: 'QUEUED', updatedAt: new Date() })
        .where(eq(candidates.id, id));

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'PROCESSING_RETRIED',
        entityId: id,
        entityType: 'CANDIDATE',
        details: { message: 'Candidate resume processing retried by recruiter.' },
      });
    });

    // 8. Re-enqueue BullMQ job and start background worker process
    await addCandidateJob(id, orgId, doc.storageKey, doc.mimeType);
    startCandidateWorker();

    logger.info(`Candidate processing retry job successfully enqueued: ${id} under organization: ${orgId}`, reqId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retry candidate processing', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
