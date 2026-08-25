import { NextResponse } from 'next/server';
import { db, jobs, auditLogs, memberships, jobEmbeddings, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getAIProvider } from '@/lib/ai/provider';
import {
  updateJobSchema,
  isValidStatusTransition,
  canPublishJob,
  JobStatus,
  JobRequirements,
} from '@/lib/validations/job';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const jobId = (await params).id;
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

    // 2. Resolve organization membership
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

    // 3. Retrieve job scoped strictly by Job ID AND Organization ID
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve job details', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const jobId = (await params).id;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on update job request', reqId);
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

    // 3. Parse and validate body
    const body = await request.json();
    const result = updateJobSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const updates = result.data;

    // 4. Resolve organization
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

    // 5. Verify RBAC permissions
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 6. Fetch job and enforce strict scoping boundaries (Inherently constrains by Org ID)
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)),
    });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job opening not found or access denied.' } },
        { status: 404 }
      );
    }

    // 7. Validate Status transition state machine
    if (updates.status && updates.status !== job.status) {
      const currentStatus = job.status as JobStatus;
      const nextStatus = updates.status;

      if (!isValidStatusTransition(currentStatus, nextStatus)) {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: `Invalid status transition from ${currentStatus} to ${nextStatus}` } },
          { status: 400 }
        );
      }

      // If transition to PUBLISHED, validate publication business rules
      if (nextStatus === 'PUBLISHED') {
        const checkRequirements = updates.requirements !== undefined ? updates.requirements : job.requirements;
        const pubCheck = canPublishJob(checkRequirements as Parameters<typeof canPublishJob>[0]);
        if (!pubCheck.valid) {
          return NextResponse.json(
            { error: { code: 'BAD_REQUEST', message: `Cannot publish job: ${pubCheck.reason}` } },
            { status: 400 }
          );
        }
      }
    }

    // 8. Execute atomic transaction to update job + write audit log
    const updatedJob = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(jobs)
        .set({
          title: updates.title !== undefined ? updates.title : job.title,
          description: updates.description !== undefined ? updates.description : job.description,
          requirements: updates.requirements !== undefined ? updates.requirements : job.requirements,
          status: updates.status !== undefined ? updates.status : job.status,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)))
        .returning();

      // Record appropriate audit log action
      let action: 'JOB_UPDATED' | 'JOB_PUBLISHED' | 'JOB_ARCHIVED' = 'JOB_UPDATED';
      if (updates.status && updates.status !== job.status) {
        action = updates.status === 'PUBLISHED' ? 'JOB_PUBLISHED' : 'JOB_ARCHIVED';
      }

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action,
        entityId: jobId,
        entityType: 'JOB',
        details: { status: updated.status, title: updated.title },
      });

      return updated;
    });

    logger.info(`Job ${jobId} updated successfully. Action: ${updatedJob.status}`, reqId);

    // 9. Generate or update job embedding if published
    if (updatedJob.status === 'PUBLISHED') {
      const requirements = updatedJob.requirements as JobRequirements | null;
      const skills = Array.isArray(requirements?.skills)
        ? requirements.skills.join(', ')
        : '';
      const denseSummary = `Title: ${updatedJob.title}\nDescription: ${updatedJob.description}\nRequired Skills: ${skills}`;

      const aiProvider = getAIProvider();
      if (aiProvider) {
        try {
          const vectorValues = await aiProvider.generateEmbedding(denseSummary);
          await db.transaction(async (tx) => {
            await tx.delete(jobEmbeddings).where(eq(jobEmbeddings.jobId, jobId));
            await tx.insert(jobEmbeddings).values({
              jobId,
              organizationId: orgId,
              embedding: vectorValues,
              model: 'text-embedding-004',
              version: '1.0',
            });
          });
          logger.info(`Job embedding generated and stored successfully for job ${jobId}`, reqId);
        } catch (embedError: unknown) {
          const errMsg = embedError instanceof Error ? embedError.message : String(embedError);
          logger.warn(`Failed to generate job embedding for job ${jobId}`, reqId, { error: errMsg });
        }
      }
    }

    return NextResponse.json(updatedJob);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to update job`, reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
