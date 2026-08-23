import { NextResponse } from 'next/server';
import { db, assessmentTemplates, assessmentQuestions, codingTestCases, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { createQuestionSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id: templateId } = await params;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on add assessment question request', reqId);
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
    const result = createQuestionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { type, title, prompt, options, correctOption, allowedLanguages, points, orderIndex, testCases } = result.data;

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

    // 5. Verify target template belongs to organization
    const template = await db.query.assessmentTemplates.findFirst({
      where: and(eq(assessmentTemplates.id, templateId), eq(assessmentTemplates.organizationId, orgId)),
    });

    if (!template) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment template not found' } },
        { status: 404 }
      );
    }

    // 6. Execute transaction: Insert question + coding test cases + audit log
    const createdQuestion = await db.transaction(async (tx) => {
      const [insertedQuestion] = await tx.insert(assessmentQuestions).values({
        organizationId: orgId,
        templateId,
        type,
        title,
        prompt,
        options: options || null,
        correctOption: correctOption || null,
        allowedLanguages: allowedLanguages || null,
        points,
        orderIndex,
      }).returning();

      let createdTestCases: (typeof codingTestCases.$inferSelect)[] = [];
      if (type === 'CODING_CHALLENGE' && testCases && testCases.length > 0) {
        createdTestCases = await tx.insert(codingTestCases).values(
          testCases.map((tc) => ({
            organizationId: orgId,
            questionId: insertedQuestion.id,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
            points: tc.points,
            timeoutMs: tc.timeoutMs,
            memoryLimitMb: tc.memoryLimitMb,
          }))
        ).returning();
      }

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'ASSESSMENT_QUESTION_ADDED',
        entityId: insertedQuestion.id,
        entityType: 'ASSESSMENT_QUESTION',
        details: { templateId, type, title, points, testCaseCount: createdTestCases.length },
      });

      return { ...insertedQuestion, testCases: createdTestCases };
    });

    logger.info(`Question added to assessment template: ${templateId}`, reqId);
    return NextResponse.json(createdQuestion, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to add question to assessment template', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
