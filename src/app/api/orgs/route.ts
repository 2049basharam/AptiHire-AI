import { NextResponse } from 'next/server';
import { db, organizations, memberships } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import { verifyCSRF } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createOrgSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
});

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  try {
    // 1. Verify CSRF
    const isCsrfValid = await verifyCSRF();
    if (!isCsrfValid) {
      logger.warn('CSRF validation failed on create organization request', reqId);
      return NextResponse.json(
        { error: { code: 'CSRF_ERROR', message: 'Forbidden. Cross-origin request blocked.' } },
        { status: 403 }
      );
    }

    // 2. Verify Session Auth
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
    const result = createOrgSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: result.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { name, slug } = result.data;

    // Check if slug is taken (bypass in Mock DB mode)
    if (process.env.MOCK_DB !== 'true') {
      const existingOrg = await db.query.organizations.findFirst({
        where: (org, { eq }) => eq(org.slug, slug),
      });

      if (existingOrg) {
        return NextResponse.json(
          { error: { code: 'SLUG_ALREADY_TAKEN', message: 'Organization slug is already in use.' } },
          { status: 409 }
        );
      }
    }

    let newOrgWithMembership: { id: string; name: string; slug: string };

    if (process.env.MOCK_DB === 'true') {
      newOrgWithMembership = { id: 'org-456', name, slug };
    } else {
      // 3. Create Org + OWNER Membership in an atomic Transaction
      newOrgWithMembership = await db.transaction(async (tx) => {
        const [newOrg] = await tx.insert(organizations).values({
          name,
          slug,
        }).returning();

        await tx.insert(memberships).values({
          userId,
          organizationId: newOrg.id,
          role: 'OWNER',
        });

        return newOrg;
      });
    }

    logger.info(`Organization created successfully: ${newOrgWithMembership.id} by user: ${userId}`, reqId);
    const response = NextResponse.json(newOrgWithMembership, { status: 201 });
    
    // In Mock DB mode, set temporary cookie representing organization state
    if (process.env.MOCK_DB === 'true') {
      response.cookies.set('org_created', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error('Organization creation failed unexpectedly', reqId, { error: errMessage });
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
