import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, users, organizations, memberships, candidates, jobs, candidateDocuments, jobEmbeddings, candidateEmbeddings, auditLogs } from '../../src/db';
import { signToken } from '../../src/lib/auth';
import { checkRateLimit, resetRateLimits } from '../../src/lib/ratelimit';
import { closeQueueConnections } from '../../src/services/queue';

describe('Integration Tests: Security Hardening & Cross-Tenant Boundaries', () => {
  let userA: any;
  let userB: any;
  let orgA: any;
  let orgB: any;

  beforeEach(async () => {
    await resetRateLimits();

    // Clean tables
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(jobEmbeddings);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create User A in Org A
    [userA] = await db.insert(users).values({
      name: 'User A',
      email: 'usera@example.com',
      passwordHash: 'hash',
    }).returning();

    [orgA] = await db.insert(organizations).values({
      name: 'Org A',
      slug: 'org-a',
    }).returning();

    await db.insert(memberships).values({
      userId: userA.id,
      organizationId: orgA.id,
      role: 'RECRUITER',
    });

    // Create User B in Org B
    [userB] = await db.insert(users).values({
      name: 'User B',
      email: 'userb@example.com',
      passwordHash: 'hash',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Org B',
      slug: 'org-b',
    }).returning();

    await db.insert(memberships).values({
      userId: userB.id,
      organizationId: orgB.id,
      role: 'RECRUITER',
    });
  });

  afterEach(async () => {
    await resetRateLimits();
    await closeQueueConnections();
  });

  describe('Rate Limiting Exhaustion Integration', () => {
    it('should trigger rate limit failure after exceeding configured limit threshold', async () => {
      const category = 'AUTH';
      const ip = '192.168.1.100';

      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimit(category, ip, { limit: 5, windowSeconds: 300 });
        expect(res.success).toBe(true);
      }

      const blockedRes = await checkRateLimit(category, ip, { limit: 5, windowSeconds: 300 });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.resetInSeconds).toBeGreaterThan(0);
    });
  });

  describe('Cross-Tenant Data Protection Invariants', () => {
    it('should strictly isolate candidates between Org A and Org B', async () => {
      const [candA] = await db.insert(candidates).values({
        organizationId: orgA.id,
        firstName: 'Alice',
        lastName: 'Applicant',
        email: 'alice@example.com',
        status: 'UPLOADED',
      }).returning();

      const [candB] = await db.insert(candidates).values({
        organizationId: orgB.id,
        firstName: 'Bob',
        lastName: 'Candidate',
        email: 'bob@example.com',
        status: 'UPLOADED',
      }).returning();

      // Org A query should only find Candidate A
      const orgACandidates = await db.query.candidates.findMany({
        where: (candidates, { eq }) => eq(candidates.organizationId, orgA.id),
      });

      expect(orgACandidates).toHaveLength(1);
      expect(orgACandidates[0].id).toBe(candA.id);
      expect(orgACandidates.some(c => c.id === candB.id)).toBe(false);
    });
  });
});
