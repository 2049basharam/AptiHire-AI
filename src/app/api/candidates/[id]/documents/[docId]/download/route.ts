import { NextResponse } from 'next/server';
import { db, candidateDocuments, memberships, eq, and } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { getStorage } from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const reqId = crypto.randomUUID();
  try {
    const { id, docId } = await params;

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

    // 3. Verify RBAC permissions (OWNER, ADMIN, RECRUITER, HIRING_MANAGER allowed to download)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Retrieve document metadata and verify candidate/org scope
    const doc = await db.query.candidateDocuments.findFirst({
      where: and(
        eq(candidateDocuments.id, docId),
        eq(candidateDocuments.candidateId, id),
        eq(candidateDocuments.organizationId, orgId)
      ),
    });

    if (!doc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Document not found or access denied.' } },
        { status: 404 }
      );
    }

    // 5. Download file from private storage
    const storage = getStorage();
    const fileBuffer = await storage.downloadFile(doc.storageKey);

    // 6. Return file response with correct headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', doc.mimeType);
    responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    responseHeaders.set('Content-Length', fileBuffer.length.toString());

    return new Response(new Uint8Array(fileBuffer), {
      headers: responseHeaders,
      status: 200,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to download resume document', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
