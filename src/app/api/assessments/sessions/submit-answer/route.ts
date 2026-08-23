import { NextResponse } from 'next/server';
import { db, interviewSessions, assessmentQuestions, interviewAnswers, eq, and } from '@/db';
import { logger } from '@/lib/logger';
import { submitAnswerSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    const body = await request.json();
    const result = submitAnswerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { token, questionId, selectedOption, textAnswer, submittedCode, programmingLanguage } = result.data;

    // 1. Verify session token
    const session = await db.query.interviewSessions.findFirst({
      where: eq(interviewSessions.accessToken, token),
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment session not found' } },
        { status: 404 }
      );
    }

    if (session.status !== 'IN_PROGRESS' && session.status !== 'STARTED') {
      return NextResponse.json(
        { error: { code: 'STATE_ERROR', message: `Cannot submit answer in session status: ${session.status}` } },
        { status: 400 }
      );
    }

    // 2. Check if timer expired
    const now = new Date();
    if (now > new Date(session.expiresAt)) {
      return NextResponse.json(
        { error: { code: 'EXPIRED', message: 'Assessment session time limit exceeded' } },
        { status: 410 }
      );
    }

    // 3. Verify question belongs to template
    const question = await db.query.assessmentQuestions.findFirst({
      where: and(eq(assessmentQuestions.id, questionId), eq(assessmentQuestions.templateId, session.templateId)),
    });

    if (!question) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Question not found in assessment template' } },
        { status: 404 }
      );
    }

    // 4. Check if answer already exists (Upsert)
    const existingAnswer = await db.query.interviewAnswers.findFirst({
      where: and(eq(interviewAnswers.sessionId, session.id), eq(interviewAnswers.questionId, questionId)),
    });

    let savedAnswer;
    if (existingAnswer) {
      [savedAnswer] = await db.update(interviewAnswers)
        .set({
          selectedOption: selectedOption ?? existingAnswer.selectedOption,
          textAnswer: textAnswer ?? existingAnswer.textAnswer,
          submittedCode: submittedCode ?? existingAnswer.submittedCode,
          programmingLanguage: programmingLanguage ?? existingAnswer.programmingLanguage,
          submittedAt: now,
        })
        .where(eq(interviewAnswers.id, existingAnswer.id))
        .returning();
    } else {
      [savedAnswer] = await db.insert(interviewAnswers).values({
        organizationId: session.organizationId,
        sessionId: session.id,
        questionId,
        selectedOption: selectedOption || null,
        textAnswer: textAnswer || null,
        submittedCode: submittedCode || null,
        programmingLanguage: programmingLanguage || null,
        submittedAt: now,
      }).returning();
    }

    return NextResponse.json(savedAnswer);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to submit assessment answer', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
