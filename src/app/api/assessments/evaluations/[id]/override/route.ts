import { NextResponse } from 'next/server';
import { db, assessmentEvaluations, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { overrideEvaluationSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: evaluationId } = await params;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on override assessment evaluation request', reqId);
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
    const result = overrideEvaluationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { newScore, overrideReason } = result.data;

    // 3. Resolve user's active organization membership
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

    // 5. Fetch existing evaluation scoped strictly to orgId
    const evaluation = await db.query.assessmentEvaluations.findFirst({
      where: and(eq(assessmentEvaluations.id, evaluationId), eq(assessmentEvaluations.organizationId, orgId)),
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment evaluation not found' } },
        { status: 404 }
      );
    }

    const previousScore = evaluation.finalScore;

    // 6. Execute atomic transaction: Update evaluation + Record audit log
    const updatedEvaluation = await db.transaction(async (tx) => {
      const [updated] = await tx.update(assessmentEvaluations)
        .set({
          finalScore: newScore,
          isOverridden: true,
          overriddenByUserId: userId,
          overrideReason,
          updatedAt: new Date(),
        })
        .where(eq(assessmentEvaluations.id, evaluation.id))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'ASSESSMENT_EVALUATION_OVERRIDDEN',
        entityId: evaluation.id,
        entityType: 'ASSESSMENT_EVALUATION',
        details: {
          sessionId: evaluation.sessionId,
          previousScore,
          newScore,
          overriddenByUserId: userId,
          overrideReason,
        },
      });

      return updated;
    });

    logger.info(`Assessment evaluation overridden for evaluation ${evaluationId}: ${previousScore} -> ${newScore}`, reqId);
    return NextResponse.json(updatedEvaluation);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to override assessment evaluation', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
