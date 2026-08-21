import { NextResponse } from 'next/server';
import { db, jobs, auditLogs, memberships, eq } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { createJobSchema } from '@/lib/validations/job';

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

    // 2. Resolve organization ID from headers or user's active membership
    const { searchParams } = new URL(request.url);
    let orgId = request.headers.get('x-org-id') || searchParams.get('orgId');

    if (!orgId) {
      const activeMembership = await db.query.memberships.findFirst({
        where: eq(memberships.userId, userId),
      });

      if (!activeMembership) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'User is not a member of any organization' } },
          { status: 403 }
        );
      }
      orgId = activeMembership.organizationId;
    }

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

    // 4. Retrieve jobs scoped strictly to the organization
    const orgJobs = await db.query.jobs.findMany({
      where: eq(jobs.organizationId, orgId),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
    });

    return NextResponse.json(orgJobs);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve jobs list', reqId, { error: errMessage });
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
      logger.warn('CSRF validation failed on create job request', reqId);
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
    const result = createJobSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { title, description, requirements } = result.data;

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

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 5. Execute transaction: Insert job + auditLog atomically
    const newJob = await db.transaction(async (tx) => {
      const [insertedJob] = await tx.insert(jobs).values({
        organizationId: orgId,
        title,
        description,
        requirements: requirements || null,
        status: 'DRAFT',
      }).returning();

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'JOB_CREATED',
        entityId: insertedJob.id,
        entityType: 'JOB',
        details: { title, status: 'DRAFT' },
      });

      return insertedJob;
    });

    logger.info(`Job created successfully: ${newJob.id} under organization: ${orgId}`, reqId);
    return NextResponse.json(newJob, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create job', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
