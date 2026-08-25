import { NextResponse } from 'next/server';
import { db, candidates, candidateDocuments, auditLogs, memberships, eq } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getStorage, validateFileBuffer } from '@/lib/storage';
import { addCandidateJob, startCandidateWorker } from '@/services/queue';
import { checkRateLimit, buildRateLimit429Response } from '@/lib/ratelimit';
import path from 'path';

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

    // 2. Resolve organization ID from headers or active membership
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

    // 3. Verify membership and RBAC role
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER', 'HIRING_MANAGER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // 4. Retrieve candidates list scoped to org
    const orgCandidates = await db.query.candidates.findMany({
      where: eq(candidates.organizationId, orgId),
      orderBy: (candidates, { desc }) => [desc(candidates.createdAt)],
    });

    return NextResponse.json(orgCandidates);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve candidates list', reqId, { error: errMessage });
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
      logger.warn('CSRF validation failed on candidate creation request', reqId);
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

    // 3. Resolve active organization ID
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

    // 4. Verify RBAC role (OWNER, ADMIN, RECRUITER allowed)
    try {
      await requireRole(userId, orgId, ['OWNER', 'ADMIN', 'RECRUITER']);
    } catch (roleError: unknown) {
      const errMsg = roleError instanceof Error ? roleError.message : String(roleError);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: errMsg } },
        { status: 403 }
      );
    }

    // Rate limit check for document uploads
    const rateLimit = await checkRateLimit('UPLOAD', `${orgId}:${userId}`);
    if (!rateLimit.success) {
      logger.warn(`Rate limit exceeded for document upload by user: ${userId} in org: ${orgId}`, reqId);
      return buildRateLimit429Response(rateLimit);
    }

    // 5. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('resume') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Resume file is required' } },
        { status: 400 }
      );
    }

    // 6. Validate File Size (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Resume file exceeds maximum size limit of 5MB' } },
        { status: 400 }
      );
    }

    // 7. Validate File Extension
    const fileExt = path.extname(file.name).toLowerCase();
    if (fileExt !== '.pdf' && fileExt !== '.docx') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Unsupported file extension. Only PDF and DOCX are allowed.' } },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 8. Validate File Signature / Magic Bytes (Antime MIME spoofing check)
    const signatureCheck = validateFileBuffer(fileBuffer);
    if (!signatureCheck.isValid || !signatureCheck.mimeType) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid file signature. Document upload rejected.' } },
        { status: 400 }
      );
    }

    const mimeType = signatureCheck.mimeType;

    // 9. Extract raw text from resume in API route directly
    let rawText = '';
    try {
      const { parseResumeToText } = require('@/services/queue');
      rawText = await parseResumeToText(fileBuffer, mimeType);
    } catch (parseError: any) {
      logger.error('Failed to parse resume text in API route', reqId, { error: parseError.message });
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parseError.message || 'Failed to extract text from resume.' } },
        { status: 400 }
      );
    }

    // 10. Write file to secure storage (non-blocking, fallback for local files)
    const secureKey = `${crypto.randomUUID()}${fileExt}`;
    const storage = getStorage();
    try {
      await storage.uploadFile(secureKey, fileBuffer, mimeType);
    } catch (storageError: any) {
      logger.warn('Storage upload failed (non-fatal)', reqId, { error: storageError.message });
    }

    // 11. Execute database transaction: Candidate + Document metadata + Audit Log
    const newCandidate = await db.transaction(async (tx) => {
      const [insertedCandidate] = await tx.insert(candidates).values({
        organizationId: orgId,
        status: 'UPLOADED',
      }).returning();

      await tx.insert(candidateDocuments).values({
        candidateId: insertedCandidate.id,
        organizationId: orgId,
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        storageKey: secureKey,
        rawText, // Pre-populated text for Render workers
      });

      await tx.insert(auditLogs).values({
        organizationId: orgId,
        userId,
        action: 'CANDIDATE_CREATED',
        entityId: insertedCandidate.id,
        entityType: 'CANDIDATE',
        details: { fileName: file.name },
      });

      return insertedCandidate;
    });

    // 11. Add to BullMQ parsing queue & start background worker
    await addCandidateJob(newCandidate.id, orgId, secureKey, mimeType);
    startCandidateWorker();

    logger.info(`Candidate created and queued for parsing: ${newCandidate.id} under organization: ${orgId}`, reqId);
    return NextResponse.json(newCandidate, { status: 201 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create candidate', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
