import { NextResponse } from 'next/server';
import { db, assessmentTemplates, candidates, interviewSessions, auditLogs, memberships, eq, and, inArray } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { batchInviteSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on batch invite request', reqId);
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
    const result = batchInviteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { templateId, candidateIds } = result.data;
    const uniqueCandidateIds = Array.from(new Set(candidateIds));

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
    await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);

    // 4. Verify template belongs to orgId
    const template = await db.query.assessmentTemplates.findFirst({
      where: and(eq(assessmentTemplates.id, templateId), eq(assessmentTemplates.organizationId, orgId)),
    });

    if (!template) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Assessment template not found in organization' } },
        { status: 404 }
      );
    }

    // 5. Verify ALL candidates belong to orgId
    const validCandidates = await db.query.candidates.findMany({
      where: and(
        inArray(candidates.id, uniqueCandidateIds),
        eq(candidates.organizationId, orgId)
      ),
    });

    if (validCandidates.length !== uniqueCandidateIds.length) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'One or more candidate IDs do not belong to your organization' } },
        { status: 403 }
      );
    }

    // 6. Execute batch invitation in database transaction
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const createdSessions: Array<{ candidateId: string; sessionId: string }> = [];
    const skippedCandidates: Array<{ candidateId: string; reason: string }> = [];

    await db.transaction(async (tx) => {
      for (const candidateId of uniqueCandidateIds) {
        // Duplicate protection check
        const existingSession = await tx.query.interviewSessions.findFirst({
          where: and(
            eq(interviewSessions.templateId, templateId),
            eq(interviewSessions.candidateId, candidateId),
            eq(interviewSessions.organizationId, orgId)
          ),
        });

        if (existingSession) {
          skippedCandidates.push({
            candidateId,
            reason: `Existing session in status: ${existingSession.status}`,
          });
          continue;
        }

        const accessToken = `session-${crypto.randomUUID()}`;
        const [inserted] = await tx.insert(interviewSessions).values({
          organizationId: orgId,
          candidateId,
          templateId,
          accessToken,
          status: 'INVITED',
          expiresAt: tokenExpiresAt,
        }).returning();

        createdSessions.push({
          candidateId,
          sessionId: inserted.id,
        });
      }

      // Record audit entry (omitting raw tokens!)
      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'INTERVIEW_SESSION_BATCH_INVITED',
        entityId: templateId,
        entityType: 'ASSESSMENT_TEMPLATE',
        details: {
          totalRequested: candidateIds.length,
          createdCount: createdSessions.length,
          skippedCount: skippedCandidates.length,
        },
      });
    });

    logger.info(`Batch assessment invitation completed for template: ${templateId}. Created: ${createdSessions.length}, Skipped: ${skippedCandidates.length}`, reqId);

    return NextResponse.json({
      totalRequested: candidateIds.length,
      createdCount: createdSessions.length,
      skippedCount: skippedCandidates.length,
      created: createdSessions,
      skipped: skippedCandidates,
    }, { status: 201 });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to process batch candidate invitations', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
