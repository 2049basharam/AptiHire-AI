import { NextResponse } from 'next/server';
import { db, assessmentTemplates, jobs, auditLogs, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { createAssessmentTemplateSchema } from '@/lib/validations/assessment';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Authenticate user
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

    // 2. Resolve organization ID
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    const activeMembership = await db.query.memberships.findFirst({
      where: eq(memberships.userId, userId),
    });

    if (!activeMembership) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'User is not a member of any organization' } },
        { status: 403 }
      );
    }
    const orgId = activeMembership.organizationId;

    // 3. Verify user membership and RBAC role
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Retrieve assessment templates scoped strictly to organization
    const conditions = [eq(assessmentTemplates.organizationId, orgId)];
    if (jobId) {
      conditions.push(eq(assessmentTemplates.jobId, jobId));
    }

    const templates = await db.query.assessmentTemplates.findMany({
      where: and(...conditions),
      with: {
        job: true,
        questions: {
          with: {
            testCases: true,
          },
        },
      },
      orderBy: (templates, { desc }) => [desc(templates.createdAt)],
    });

    return NextResponse.json(templates);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve assessment templates', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on create assessment template request', reqId);
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
    const result = createAssessmentTemplateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { jobId, title, description, timeLimitMinutes, passingScore } = result.data;

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

    // 5. Verify target job belongs to orgId
    const targetJob = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!targetJob) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Target job opening not found in organization' } },
        { status: 404 }
      );
    }

    // 6. Execute transaction: Insert template + auditLog
    const newTemplate = await db.transaction(async (tx) => {
      const [insertedTemplate] = await tx.insert(assessmentTemplates).values({
        organizationId: orgId,
        jobId,
        title,
        description: description || null,
        timeLimitMinutes,
        passingScore,
        status: 'ACTIVE',
      }).returning();

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'ASSESSMENT_TEMPLATE_CREATED',
        entityId: insertedTemplate.id,
        entityType: 'ASSESSMENT_TEMPLATE',
        details: { title, jobId, timeLimitMinutes, passingScore },
      });

      return insertedTemplate;
    });

    logger.info(`Assessment template created: ${newTemplate.id} under organization: ${orgId}`, reqId);
    return NextResponse.json(newTemplate, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create assessment template', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
