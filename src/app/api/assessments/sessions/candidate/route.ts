import { NextResponse } from 'next/server';
import { db, interviewSessions, eq } from '@/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Access token is required' } },
        { status: 400 }
      );
    }

    // 1. Fetch interview session by token
    const session = await db.query.interviewSessions.findFirst({
      where: eq(interviewSessions.accessToken, token),
      with: {
        candidate: true,
        template: {
          with: {
            questions: {
              with: {
                testCases: true,
              },
            },
          },
        },
        answers: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Invalid or expired assessment session token' } },
        { status: 404 }
      );
    }

    // 2. Check if expired
    const now = new Date();
    if (now > new Date(session.expiresAt) && session.status !== 'SUBMITTED' && session.status !== 'EVALUATED' && session.status !== 'FINALIZED') {
      return NextResponse.json(
        {
          session: {
            id: session.id,
            status: 'EXPIRED',
            expiresAt: session.expiresAt,
          },
          error: { code: 'EXPIRED', message: 'This assessment session has expired.' },
        },
        { status: 410 }
      );
    }

    // 3. Sanitize questions payload for candidate view
    // Strip correctOption for MCQs, and filter hidden test cases details for coding questions
    const sanitizedQuestions = session.template.questions.map((q) => {
      const publicTestCases = q.testCases
        .filter((tc) => !tc.isHidden)
        .map((tc) => ({
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          points: tc.points,
        }));

      return {
        id: q.id,
        type: q.type,
        title: q.title,
        prompt: q.prompt,
        options: q.options,
        allowedLanguages: q.allowedLanguages,
        points: q.points,
        orderIndex: q.orderIndex,
        publicTestCases,
      };
    });

    // Sort questions by orderIndex
    sanitizedQuestions.sort((a, b) => a.orderIndex - b.orderIndex);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        expiresAt: session.expiresAt,
        candidateName: [session.candidate.firstName, session.candidate.lastName].filter(Boolean).join(' ') || session.candidate.email || 'Candidate',
      },
      template: {
        id: session.template.id,
        title: session.template.title,
        description: session.template.description,
        timeLimitMinutes: session.template.timeLimitMinutes,
      },
      questions: sanitizedQuestions,
      answers: session.answers,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get candidate assessment session', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
