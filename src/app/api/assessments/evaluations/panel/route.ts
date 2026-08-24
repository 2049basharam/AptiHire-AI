import { NextResponse } from 'next/server';
import { db, panelEvaluations, interviewSessions, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireOrgMembership } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { panelEvaluationSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on panel evaluation request', reqId);
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
    const result = panelEvaluationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { sessionId, recommendation, qualitativeFeedback, scoreOverride, overrideReason } = result.data;

    // 3. Resolve organization ID & verify membership
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
    await requireOrgMembership(userId, orgId);

    // 4. Verify session belongs to orgId
    const session = await db.query.interviewSessions.findFirst({
      where: and(eq(interviewSessions.id, sessionId), eq(interviewSessions.organizationId, orgId)),
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment session not found in organization' } },
        { status: 404 }
      );
    }

    // 5. Upsert panel evaluation scorecard
    const existingEvaluation = await db.query.panelEvaluations.findFirst({
      where: and(
        eq(panelEvaluations.sessionId, sessionId),
        eq(panelEvaluations.evaluatorUserId, userId)
      ),
    });

    let scorecard;

    if (existingEvaluation) {
      [scorecard] = await db.update(panelEvaluations)
        .set({
          recommendation,
          qualitativeFeedback,
          scoreOverride: scoreOverride ?? null,
          overrideReason: overrideReason ?? null,
          updatedAt: new Date(),
        })
        .where(eq(panelEvaluations.id, existingEvaluation.id))
        .returning();
    } else {
      [scorecard] = await db.insert(panelEvaluations).values({
        organizationId: orgId,
        sessionId,
        evaluatorUserId: userId,
        recommendation,
        qualitativeFeedback,
        scoreOverride: scoreOverride ?? null,
        overrideReason: overrideReason ?? null,
      }).returning();
    }

    // 6. Record audit event (NEVER log tokens or secrets)
    await db.insert(auditLogs).values({
      organizationId: orgId,
      userId,
      action: 'PANEL_EVALUATION_SUBMITTED',
      entityId: scorecard.id,
      entityType: 'PANEL_EVALUATION',
      details: { sessionId, evaluatorUserId: userId, recommendation },
    });

    logger.info(`Panel evaluation submitted for session: ${sessionId} by evaluator: ${userId}`, reqId);
    return NextResponse.json(scorecard, { status: existingEvaluation ? 200 : 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to submit panel evaluation', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
