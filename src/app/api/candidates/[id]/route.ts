import { NextResponse } from 'next/server';
import { db, candidates, candidateProfiles, candidateDocuments, candidateEvidence, auditLogs, memberships, candidateStatusHistory, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { createNotificationForOrgRecruiters } from '@/lib/notifications';
import { UpdateProfileSchema, isValidCandidateTransition } from '@/lib/validations/candidate';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id } = await params;

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

    // 3. Verify RBAC permissions (OWNER, ADMIN, RECRUITER, HIRING_MANAGER allowed to view)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Retrieve candidate scoped to the organization with related tables
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, id), eq(candidates.organizationId, orgId)),
      with: {
        documents: true,
        profiles: true,
        evidence: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    return NextResponse.json(candidate);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve candidate detail', reqId, { error: errMessage });
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
    const { id } = await params;

    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on update candidate request', reqId);
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

    // 4. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed to edit)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 5. Fetch existing candidate to verify scope
    const existingCandidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, id), eq(candidates.organizationId, orgId)),
    });

    if (!existingCandidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 6. Validate input body
    const body = await request.json();
    const result = UpdateProfileSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const payload = result.data;

    // Concurrency check and transition validation
    if (payload.status !== undefined) {
      if (payload.expectedPreviousStatus !== undefined && existingCandidate.status !== payload.expectedPreviousStatus) {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: `Candidate status has changed. Expected status: '${payload.expectedPreviousStatus}', but actual status is '${existingCandidate.status}'.` } },
          { status: 409 }
        );
      }

      if (!isValidCandidateTransition(existingCandidate.status, payload.status)) {
        return NextResponse.json(
          { error: { code: 'INVALID_TRANSITION', message: `Invalid status transition from '${existingCandidate.status}' to '${payload.status}'.` } },
          { status: 400 }
        );
      }
    }

    // 7. Update profile details in database transaction
    await db.transaction(async (tx) => {
      // Update core candidate fields (firstName, lastName, email, phone)
      const candidateUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (payload.firstName !== undefined) candidateUpdates.firstName = payload.firstName;
      if (payload.lastName !== undefined) candidateUpdates.lastName = payload.lastName;
      if (payload.email !== undefined) candidateUpdates.email = payload.email;
      if (payload.phone !== undefined) candidateUpdates.phone = payload.phone;
      if (payload.status !== undefined) candidateUpdates.status = payload.status;

      await tx.update(candidates)
        .set(candidateUpdates)
        .where(eq(candidates.id, id));

      // If status transitioned, record status history log
      if (payload.status !== undefined && payload.status !== existingCandidate.status) {
        await tx.insert(candidateStatusHistory).values({
          organizationId: orgId,
          candidateId: id,
          jobId: payload.jobId || null,
          previousStatus: existingCandidate.status,
          newStatus: payload.status,
          actorUserId: userId,
          reason: payload.reason || null,
          notes: payload.notes || null,
        });

        // Trigger in-app notification for org recruiters
        await createNotificationForOrgRecruiters({
          organizationId: orgId,
          actorUserId: userId,
          title: `Candidate Status Updated: ${existingCandidate.firstName} ${existingCandidate.lastName}`,
          message: `Candidate moved from ${existingCandidate.status} to ${payload.status}`,
          type: `CANDIDATE_${payload.status}`,
          entityId: id,
          entityType: 'CANDIDATE',
        });
      }

      // Update candidate profile fields
      const profile = await tx.query.candidateProfiles.findFirst({
        where: eq(candidateProfiles.candidateId, id),
      });

      if (profile) {
        const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
        if (payload.summary !== undefined) profileUpdates.summary = payload.summary;
        if (payload.experience !== undefined) profileUpdates.experience = payload.experience;
        if (payload.education !== undefined) profileUpdates.education = payload.education;
        if (payload.skills !== undefined) profileUpdates.skills = payload.skills.map(s => s.name);

        await tx.update(candidateProfiles)
          .set(profileUpdates)
          .where(eq(candidateProfiles.candidateId, id));

        // Re-align evidence list if recruiter updated skills
        if (payload.skills !== undefined) {
          await tx.delete(candidateEvidence).where(eq(candidateEvidence.candidateId, id));
          
          const doc = await tx.query.candidateDocuments.findFirst({
            where: eq(candidateDocuments.candidateId, id),
          });

          if (doc) {
            for (const skill of payload.skills) {
              await tx.insert(candidateEvidence).values({
                candidateId: id,
                organizationId: orgId,
                skill: skill.name,
                sourceDocumentId: doc.id,
                excerpt: skill.excerpt,
                page: null,
              });
            }
          }
        }
      }

      // Record audit log
      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'CANDIDATE_UPDATED',
        entityId: id,
        entityType: 'CANDIDATE',
        details: { fieldsChanged: Object.keys(payload) },
      });
    });

    logger.info(`Candidate profile updated successfully: ${id} under organization: ${orgId}`, reqId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update candidate details', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
