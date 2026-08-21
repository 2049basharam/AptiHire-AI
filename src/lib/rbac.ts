import { cookies } from 'next/headers';
import { db, memberships, and, eq } from '../db';
import { verifyToken } from './auth';

export class AuthorizationError extends Error {
  constructor(public code: 'UNAUTHENTICATED' | 'FORBIDDEN', message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Extracts and verifies the session token from the cookie jar, returning the authenticated userId.
 */
export async function getCurrentUserId(): Promise<string> {
  const cookieJar = await cookies();
  const sessionToken = cookieJar.get('session')?.value;

  if (!sessionToken) {
    throw new AuthorizationError('UNAUTHENTICATED', 'No active session token found');
  }

  try {
    const payload = await verifyToken(sessionToken);
    return payload.userId;
  } catch {
    throw new AuthorizationError('UNAUTHENTICATED', 'Session token is invalid or expired');
  }
}

/**
 * Resolves the user's role in the organization directly from the database.
 * This is the primary security boundary and prevents stale token exploits.
 */
export async function requireOrgMembership(userId: string, organizationId: string): Promise<string> {
  if (!organizationId) {
    throw new AuthorizationError('FORBIDDEN', 'Organization ID is required for scoping');
  }

  const member = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.organizationId, organizationId)
    ),
  });

  if (!member) {
    throw new AuthorizationError('FORBIDDEN', 'User is not a member of this organization');
  }

  return member.role;
}

/**
 * Resolves and validates the user's role against allowed RBAC roles in the organization.
 */
export async function requireRole(userId: string, organizationId: string, allowedRoles: string[]): Promise<string> {
  const userRole = await requireOrgMembership(userId, organizationId);

  if (!allowedRoles.includes(userRole)) {
    throw new AuthorizationError(
      'FORBIDDEN',
      `Insufficient permissions. Required one of: ${allowedRoles.join(', ')}. Found: ${userRole}`
    );
  }

  return userRole;
}
