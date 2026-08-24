import { NextResponse } from 'next/server';
import { db, auditLogs, memberships, eq, and, gte, lte } from '@/db';
import { getCurrentUserId, requireRole } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { auditLogExportSchema } from '@/lib/validations/assessment';

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

    // 2. Resolve organization ID & verify RBAC permissions (OWNER or ADMIN only)
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
    await requireRole(userId, orgId, ['OWNER', 'ADMIN']);

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryInput = {
      format: searchParams.get('format') || 'json',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      action: searchParams.get('action') || undefined,
    };

    const parseResult = auditLogExportSchema.safeParse(queryInput);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parseResult.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { format, startDate, endDate, action } = parseResult.data;

    // 4. Build query conditions
    const conditions = [eq(auditLogs.organizationId, orgId)];

    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }
    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }

    const records = await db.query.auditLogs.findMany({
      where: and(...conditions),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    });

    // 5. Redact sensitive values & sanitize CSV formula injection
    const redactedLogs = records.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      userId: log.userId || 'SYSTEM',
      action: sanitizeCsvValue(log.action),
      entityType: sanitizeCsvValue(log.entityType || ''),
      entityId: log.entityId || '',
      details: redactSensitiveDetails(log.details),
    }));

    // 6. Record audit action (omitting payload to prevent recursive export loop)
    await db.insert(auditLogs).values({
      organizationId: orgId,
      userId,
      action: 'AUDIT_LOGS_EXPORTED',
      entityId: orgId,
      entityType: 'ORGANIZATION',
      details: { format, recordCount: redactedLogs.length, startDate, endDate, action },
    });

    logger.info(`Audit logs exported by user: ${userId}. Format: ${format}, Records: ${redactedLogs.length}`, reqId);

    // 7. Format output payload (JSON or CSV)
    if (format === 'csv') {
      const csvHeaders = ['ID', 'Timestamp', 'User ID', 'Action', 'Entity Type', 'Entity ID', 'Details'];
      const csvRows = redactedLogs.map((log) => [
        log.id,
        log.timestamp,
        log.userId,
        sanitizeCsvValue(log.action),
        sanitizeCsvValue(log.entityType),
        log.entityId,
        sanitizeCsvValue(JSON.stringify(log.details)),
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      const filename = `audit_logs_${orgId.slice(0, 8)}_${Date.now()}.csv`;

      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      organizationId: orgId,
      exportedAt: new Date().toISOString(),
      recordCount: redactedLogs.length,
      logs: redactedLogs,
    }, { status: 200 });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to export audit logs', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}

/**
 * Recursively redacts sensitive token and secret keys from details payload.
 */
function redactSensitiveDetails(details: unknown): unknown {
  if (!details || typeof details !== 'object') {
    return details;
  }

  if (Array.isArray(details)) {
    return details.map(redactSensitiveDetails);
  }

  const sensitiveKeys = [
    'accesstoken', 'token', 'jwt', 'authorization', 'password',
    'secret', 'apikey', 'refreshtoken', 'bearer', 'auth'
  ];

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[\-_]/g, '');
    const isSensitive = sensitiveKeys.some((k) => normalizedKey.includes(k));
    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveDetails(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Sanitizes CSV cell strings against formula injection vulnerabilities (=, +, -, @).
 */
function sanitizeCsvValue(val: string): string {
  if (!val || typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return val;
}
