import { NextResponse } from 'next/server';
import { db, interviewSessions, auditLogs, eq } from '@/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Access token is required' } },
        { status: 400 }
      );
    }

    const session = await db.query.interviewSessions.findFirst({
      where: eq(interviewSessions.accessToken, token),
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment session not found' } },
        { status: 404 }
      );
    }

    if (session.status === 'SUBMITTED' || session.status === 'EVALUATED' || session.status === 'FINALIZED') {
      return NextResponse.json(
        { message: 'Assessment session is already submitted.', status: session.status }
      );
    }

    const now = new Date();

    const finalizedSession = await db.transaction(async (tx) => {
      const [updated] = await tx.update(interviewSessions)
        .set({
          status: 'SUBMITTED',
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(interviewSessions.id, session.id))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: session.organizationId,
        action: 'INTERVIEW_SESSION_SUBMITTED',
        entityId: session.id,
        entityType: 'INTERVIEW_SESSION',
        details: { candidateId: session.candidateId, submittedAt: now },
      });

      return updated;
    });

    logger.info(`Assessment session finalized by candidate: ${session.id}`, reqId);
    return NextResponse.json(finalizedSession);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to finalize assessment session', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
