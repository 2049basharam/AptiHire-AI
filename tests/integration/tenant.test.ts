import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, users, organizations, memberships, jobs, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates, eq } from '../../src/db';
import { requireOrgMembership, requireRole, AuthorizationError } from '../../src/lib/rbac';

describe('Real PostgreSQL Integration Tests: Multi-Tenant and RBAC Isolation', () => {
  beforeEach(async () => {
    // Clean database before each test
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);
  });

  afterEach(async () => {
    // Clean database after each test
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);
  });


  describe('Database CRUDS & Transaction Rollback', () => {
    it('should successfully insert users, organizations, and memberships', async () => {
      // 1. User Insertion
      const [user] = await db.insert(users).values({
        name: 'John Test',
        email: 'john.test@example.com',
        passwordHash: 'dummyhash123',
      }).returning();
      
      expect(user.id).toBeDefined();
      expect(user.name).toBe('John Test');

      // 2. Organization Insertion
      const [org] = await db.insert(organizations).values({
        name: 'Test Org Ltd',
        slug: 'test-org-ltd',
      }).returning();

      expect(org.id).toBeDefined();
      expect(org.slug).toBe('test-org-ltd');

      // 3. Membership Insertion
      const [membership] = await db.insert(memberships).values({
        userId: user.id,
        organizationId: org.id,
        role: 'OWNER',
      }).returning();

      expect(membership.id).toBeDefined();
      expect(membership.role).toBe('OWNER');

      // 4. Lookup validations
      const foundUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });
      expect(foundUser?.email).toBe('john.test@example.com');

      const foundMembership = await db.query.memberships.findFirst({
        where: eq(memberships.id, membership.id),
      });
      expect(foundMembership?.role).toBe('OWNER');
    });

    it('should roll back organization creation if membership insertion fails in transaction', async () => {
      const rollbackSlug = 'rollback-org-slug';
      
      try {
        await db.transaction(async (tx) => {
          // Insert Organization
          await tx.insert(organizations).values({
            name: 'Rollback Org',
            slug: rollbackSlug,
          });

          // Intentionally throw error to simulate failure before membership insert completes
          throw new Error('Simulated transaction failure');
        });
      } catch (err) {
        // Expected rollback
      }

      // Query database to verify organization was NOT created
      const rolledBackOrg = await db.query.organizations.findFirst({
        where: eq(organizations.slug, rollbackSlug),
      });
      expect(rolledBackOrg).toBeUndefined();
    });
  });

  describe('Tenant Separation Boundaries (Real DB)', () => {
    it('should ALLOW access to Organization A when membership exists, and DENY access to Organization B (Cross-Tenant Attack)', async () => {
      // Create User A
      const [userA] = await db.insert(users).values({
        name: 'User A',
        email: 'usera@example.com',
        passwordHash: 'hasha',
      }).returning();

      // Create User B
      const [userB] = await db.insert(users).values({
        name: 'User B',
        email: 'userb@example.com',
        passwordHash: 'hashb',
      }).returning();

      // Create Org A
      const [orgA] = await db.insert(organizations).values({
        name: 'Org A',
        slug: 'org-a',
      }).returning();

      // Create Org B
      const [orgB] = await db.insert(organizations).values({
        name: 'Org B',
        slug: 'org-b',
      }).returning();

      // Setup memberships:
      // User A -> Org A (RECRUITER)
      await db.insert(memberships).values({
        userId: userA.id,
        organizationId: orgA.id,
        role: 'RECRUITER',
      });

      // User B -> Org B (OWNER)
      await db.insert(memberships).values({
        userId: userB.id,
        organizationId: orgB.id,
        role: 'OWNER',
      });

      // Test 1: User A -> Org A (Allowed)
      const role = await requireOrgMembership(userA.id, orgA.id);
      expect(role).toBe('RECRUITER');

      // Test 2: User A -> Org B (Denied - Cross Tenant Attack)
      await expect(
        requireOrgMembership(userA.id, orgB.id)
      ).rejects.toThrowError(
        new AuthorizationError('FORBIDDEN', 'User is not a member of this organization')
      );

      // Test 3: User B -> Org A (Denied - Cross Tenant Attack)
      await expect(
        requireOrgMembership(userB.id, orgA.id)
      ).rejects.toThrowError(
        new AuthorizationError('FORBIDDEN', 'User is not a member of this organization')
      );
    });
  });

  describe('RBAC Scoping Boundaries (Real DB)', () => {
    it('should enforce proper role clearance levels', async () => {
      const [user] = await db.insert(users).values({
        name: 'Employee',
        email: 'employee@example.com',
        passwordHash: 'hash',
      }).returning();

      const [org] = await db.insert(organizations).values({
        name: 'Company',
        slug: 'company',
      }).returning();

      // Membership is HIRING_MANAGER
      await db.insert(memberships).values({
        userId: user.id,
        organizationId: org.id,
        role: 'HIRING_MANAGER',
      });

      // Test 1: Allow matching role
      const activeRole = await requireRole(user.id, org.id, ['OWNER', 'ADMIN', 'HIRING_MANAGER']);
      expect(activeRole).toBe('HIRING_MANAGER');

      // Test 2: Deny superior role (OWNER)
      await expect(
        requireRole(user.id, org.id, ['OWNER'])
      ).rejects.toThrowError(
        new AuthorizationError(
          'FORBIDDEN',
          'Insufficient permissions. Required one of: OWNER. Found: HIRING_MANAGER'
        )
      );
    });
  });
});
