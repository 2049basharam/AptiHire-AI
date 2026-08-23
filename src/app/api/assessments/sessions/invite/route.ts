import { NextResponse } from 'next/server';
import { db, assessmentTemplates, candidates, interviewSessions, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { inviteCandidateSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on invite candidate assessment request', reqId);
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

    const body = await request.json();
    const result = inviteCandidateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { templateId, candidateId } = result.data;

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

    // 4. Verify RBAC permissions
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 5. Verify template belongs to orgId
    const template = await db.query.assessmentTemplates.findFirst({
      where: and(eq(assessmentTemplates.id, templateId), eq(assessmentTemplates.organizationId, orgId)),
    });

    if (!template) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment template not found in organization' } },
        { status: 404 }
      );
    }

    // 6. Verify candidate belongs to orgId
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found in organization' } },
        { status: 404 }
      );
    }

    // 7. Generate access token & expiration (7 days for invitation validity before starting)
    const accessToken = `session-${crypto.randomUUID()}`;
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await db.transaction(async (tx) => {
      const [insertedSession] = await tx.insert(interviewSessions).values({
        organizationId: orgId,
        candidateId,
        templateId,
        accessToken,
        status: 'INVITED',
        expiresAt: tokenExpiresAt,
      }).returning();

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'INTERVIEW_SESSION_INVITED',
        entityId: insertedSession.id,
        entityType: 'INTERVIEW_SESSION',
        details: { candidateId, templateId },
      });

      return insertedSession;
    });

    logger.info(`Candidate invited to assessment session: ${session.id}`, reqId);
    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to invite candidate to assessment session', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
