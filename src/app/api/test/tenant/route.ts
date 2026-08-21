import { NextResponse } from 'next/server';
import { getCurrentUserId, requireOrgMembership } from '@/lib/rbac';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing orgId parameter' } },
        { status: 400 }
      );
    }

    // 1. Verify session auth
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

    // 2. Verify database-driven membership
    const role = await requireOrgMembership(userId, orgId);

    return NextResponse.json({
      success: true,
      userId,
      orgId,
      role,
    });
  } catch (error: unknown) {
    const isForbidden = error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'FORBIDDEN';
    const errMessage = error instanceof Error ? error.message : String(error);
    if (isForbidden) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMessage } },
        { status: 403 }
      );
    }
    logger.error('Tenant test verification failed unexpectedly', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
