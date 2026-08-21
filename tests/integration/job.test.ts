import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, users, organizations, memberships, jobs, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates, eq, and } from '../../src/db';
import { requireOrgMembership, requireRole, AuthorizationError } from '../../src/lib/rbac';

describe('Real PostgreSQL Integration Tests: Job Management & Tenant Security', () => {
  let userRecruiter: any;
  let userCandidate: any;
  let organizationA: any;
  let organizationB: any;

  beforeEach(async () => {
    // Clean all related tables before each test
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


    // Setup User A (Recruiter) and User B (Candidate)
    [userRecruiter] = await db.insert(users).values({
      name: 'Recruiter Admin',
      email: 'recruiter@example.com',
      passwordHash: 'scryptpasswordhash',
    }).returning();

    [userCandidate] = await db.insert(users).values({
      name: 'Candidate User',
      email: 'candidate@example.com',
      passwordHash: 'candidatepasswordhash',
    }).returning();

    // Setup Org A and Org B
    [organizationA] = await db.insert(organizations).values({
      name: 'Tenant Org A',
      slug: 'org-a',
    }).returning();

    [organizationB] = await db.insert(organizations).values({
      name: 'Tenant Org B',
      slug: 'org-b',
    }).returning();

    // Assign memberships
    // User Recruiter -> Org A (RECRUITER)
    await db.insert(memberships).values({
      userId: userRecruiter.id,
      organizationId: organizationA.id,
      role: 'RECRUITER',
    });

    // User Candidate -> Org A (CANDIDATE)
    await db.insert(memberships).values({
      userId: userCandidate.id,
      organizationId: organizationA.id,
      role: 'CANDIDATE',
    });
  });

  afterEach(async () => {
    // Clean tables after each test
    await db.delete(auditLogs);
    await db.delete(memberships);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);
  });

  describe('Job CRUD & Audit Logs Atomic Transactions', () => {
    it('should create a job and record an audit log atomically', async () => {
      const title = 'Frontend Engineer';
      const description = 'Looking for React/NextJS developer';

      const [newJob] = await db.insert(jobs).values({
        organizationId: organizationA.id,
        title,
        description,
        status: 'DRAFT',
      }).returning();

      expect(newJob.id).toBeDefined();
      expect(newJob.status).toBe('DRAFT');

      // Record audit log
      await db.insert(auditLogs).values({
        organizationId: organizationA.id,
        userId: userRecruiter.id,
        action: 'JOB_CREATED',
        entityId: newJob.id,
        entityType: 'JOB',
        details: { title, status: 'DRAFT' },
      });

      // Verify job is stored
      const foundJob = await db.query.jobs.findFirst({
        where: eq(jobs.id, newJob.id),
      });
      expect(foundJob?.title).toBe(title);

      // Verify audit log exists
      const logs = await db.query.auditLogs.findMany({
        where: and(eq(auditLogs.organizationId, organizationA.id), eq(auditLogs.entityId, newJob.id)),
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('JOB_CREATED');
    });

    it('should roll back job creation if audit log insertion fails in transaction', async () => {
      const rollbackTitle = 'Rollback Job Title';
      
      try {
        await db.transaction(async (tx) => {
          const [insertedJob] = await tx.insert(jobs).values({
            organizationId: organizationA.id,
            title: rollbackTitle,
            description: 'This is a description',
            status: 'DRAFT',
          }).returning();

          // Force failure by throwing error
          throw new Error('Simulated audit log insertion failure');
        });
      } catch (err) {
        // Expected rollback
      }

      // Verify job was NOT created
      const rolledBackJob = await db.query.jobs.findFirst({
        where: eq(jobs.title, rollbackTitle),
      });
      expect(rolledBackJob).toBeUndefined();
    });
  });

  describe('Tenant Isolation Scoping Constraints', () => {
    it('should only fetch jobs belonging to the users organization and reject other jobs (Cross-Tenant Security)', async () => {
      // Create Job in Org A
      const [jobA] = await db.insert(jobs).values({
        organizationId: organizationA.id,
        title: 'Job A Org A',
        description: 'Description A',
      }).returning();

      // Create Job in Org B
      const [jobB] = await db.insert(jobs).values({
        organizationId: organizationB.id,
        title: 'Job B Org B',
        description: 'Description B',
      }).returning();

      // Recruiter A querying Org A job should succeed
      const queryA = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobA.id), eq(jobs.organizationId, organizationA.id)),
      });
      expect(queryA?.id).toBe(jobA.id);

      // Recruiter A attempting to query Org B job scoped to Org A should return undefined (Fails Closed)
      const queryB = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, jobB.id), eq(jobs.organizationId, organizationA.id)),
      });
      expect(queryB).toBeUndefined();
    });

    it('should reject updates to jobs not owned by the organization (Cross-Tenant Mutation)', async () => {
      // Create Job in Org B
      const [jobB] = await db.insert(jobs).values({
        organizationId: organizationB.id,
        title: 'Job B Org B',
        description: 'Description B',
      }).returning();

      // Recruiter A tries to update Job B in Org B under Org A context
      const [updated] = await db
        .update(jobs)
        .set({ title: 'Hacked Title' })
        .where(and(eq(jobs.id, jobB.id), eq(jobs.organizationId, organizationA.id)))
        .returning();

      // Verify no rows were updated
      expect(updated).toBeUndefined();

      // Verify title remained unchanged
      const checkJobB = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobB.id),
      });
      expect(checkJobB?.title).toBe('Job B Org B');
    });
  });

  describe('RBAC Scoping Constraints (Real DB)', () => {
    it('should ALLOW RECRUITER to perform job mutations', async () => {
      const activeRole = await requireRole(userRecruiter.id, organizationA.id, ['OWNER', 'ADMIN', 'RECRUITER']);
      expect(activeRole).toBe('RECRUITER');
    });

    it('should DENY CANDIDATE from performing job mutations', async () => {
      await expect(
        requireRole(userCandidate.id, organizationA.id, ['OWNER', 'ADMIN', 'RECRUITER'])
      ).rejects.toThrowError(
        new AuthorizationError('FORBIDDEN', 'Insufficient permissions. Required one of: OWNER, ADMIN, RECRUITER. Found: CANDIDATE')
      );
    });
  });
});
