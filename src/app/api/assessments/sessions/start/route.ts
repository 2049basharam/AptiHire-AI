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
      with: {
        template: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment session not found' } },
        { status: 404 }
      );
    }

    if (session.status !== 'INVITED' && session.status !== 'STARTED') {
      return NextResponse.json(
        { error: { code: 'STATE_ERROR', message: `Cannot start session in status: ${session.status}` } },
        { status: 400 }
      );
    }

    const now = new Date();
    // Calculate expiration time based on template's time limit
    const timerExpiresAt = new Date(now.getTime() + session.template.timeLimitMinutes * 60 * 1000);

    const updatedSession = await db.transaction(async (tx) => {
      const [updated] = await tx.update(interviewSessions)
        .set({
          status: 'IN_PROGRESS',
          startedAt: session.startedAt || now,
          expiresAt: timerExpiresAt,
          updatedAt: now,
        })
        .where(eq(interviewSessions.id, session.id))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: session.organizationId,
        action: 'INTERVIEW_SESSION_STARTED',
        entityId: session.id,
        entityType: 'INTERVIEW_SESSION',
        details: { candidateId: session.candidateId, startedAt: now, expiresAt: timerExpiresAt },
      });

      return updated;
    });

    logger.info(`Assessment session started by candidate: ${session.id}`, reqId);
    return NextResponse.json(updatedSession);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start assessment session', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
