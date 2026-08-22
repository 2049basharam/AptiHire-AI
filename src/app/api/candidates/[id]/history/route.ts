import { NextResponse } from 'next/server';
import { db, candidates, candidateStatusHistory, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { asc } from 'drizzle-orm';

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

    // 3. Verify RBAC permissions (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Verify candidate organization boundary
    const candidate = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, id), eq(candidates.organizationId, orgId)),
    });

    if (!candidate) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Candidate not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Query status history chronological timeline log
    const historyLogs = await db.query.candidateStatusHistory.findMany({
      where: eq(candidateStatusHistory.candidateId, id),
      orderBy: [asc(candidateStatusHistory.createdAt)],
      with: {
        actor: {
          columns: {
            name: true,
            email: true,
          }
        },
        job: {
          columns: {
            title: true,
          }
        }
      }
    });

    logger.info(`Candidate status history logs retrieved: ${id} for org: ${orgId}`, reqId);
    return NextResponse.json(historyLogs);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve candidate status history logs', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
