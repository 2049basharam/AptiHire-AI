import { NextResponse } from 'next/server';
import { db, candidates, candidateProfiles, candidateEmbeddings, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { getAIProvider } from '@/lib/ai/provider';
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
      logger.warn('CSRF validation failed on candidate approval', reqId);
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

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed to approve)
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

    // 6. Fetch candidate profile details
    const profile = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.candidateId, id),
    });

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Candidate profile must be parsed before approval.' } },
        { status: 400 }
      );
    }

    // 7. Construct dense semantic summary for embedding
    const skillsText = (profile.skills as string[]).join(', ');
    const denseSummary = `Summary: ${profile.summary || ''}\nSkills: ${skillsText}`;

    // 8. Generate embedding vector
    const aiProvider = getAIProvider();
    if (!aiProvider) {
      return NextResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'AI Provider is not configured' } },
        { status: 503 }
      );
    }

    const vectorValues = await aiProvider.generateEmbedding(denseSummary);

    // 9. Execute transaction: update status, clean/save embedding, write audit log
    await db.transaction(async (tx) => {
      // Transition candidate status to APPROVED
      await tx.update(candidates)
        .set({ status: 'APPROVED', updatedAt: new Date() })
        .where(eq(candidates.id, id));

      // Clean previous embedding for idempotency
      await tx.delete(candidateEmbeddings)
        .where(eq(candidateEmbeddings.candidateId, id));

      // Insert new embedding
      await tx.insert(candidateEmbeddings).values({
        candidateId: id,
        organizationId: orgId,
        embedding: vectorValues,
        model: 'text-embedding-004',
        version: '1.0',
      });

      // Write audit log
      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'CANDIDATE_APPROVED',
        entityId: id,
        entityType: 'CANDIDATE',
        details: { message: 'Candidate profile approved and vector embedding generated.' },
      });
    });

    logger.info(`Candidate approved and embedded successfully: ${id} under organization: ${orgId}`, reqId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to approve candidate', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
