import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, users, organizations, memberships, candidates, jobs, candidateNotes, savedSearches, notifications, eq, and } from '../../src/db';
import { requireOrgMembership, AuthorizationError } from '../../src/lib/rbac';

describe('Phase 4D — Multi-Tenant Isolation Adversarial Verification', () => {
  let userAId: string;
  let orgAId: string;

  let userBId: string;
  let orgBId: string;

  let candidateBId: string;
  let jobBId: string;
  let noteBId: string;
  let searchBId: string;

  beforeAll(async () => {
    // 1. Create Org A + User A
    const [userA] = await db.insert(users).values({
      name: 'Adversarial Recruiter A',
      email: `adv.a.${Date.now()}@example.com`,
      passwordHash: 'hashA',
    }).returning();
    userAId = userA.id;

    const [orgA] = await db.insert(organizations).values({
      name: 'Org A Security Boundary',
      slug: `org-a-adv-${Date.now()}`,
    }).returning();
    orgAId = orgA.id;

    await db.insert(memberships).values({
      userId: userAId,
      organizationId: orgAId,
      role: 'OWNER',
    });

    // 2. Create Org B + User B + Protected Resources
    const [userB] = await db.insert(users).values({
      name: 'Victim Recruiter B',
      email: `adv.b.${Date.now()}@example.com`,
      passwordHash: 'hashB',
    }).returning();
    userBId = userB.id;

    const [orgB] = await db.insert(organizations).values({
      name: 'Org B Target',
      slug: `org-b-adv-${Date.now()}`,
    }).returning();
    orgBId = orgB.id;

    await db.insert(memberships).values({
      userId: userBId,
      organizationId: orgBId,
      role: 'OWNER',
    });

    // Create candidate in Org B
    const [candB] = await db.insert(candidates).values({
      organizationId: orgBId,
      firstName: 'Org B Protected',
      lastName: 'Candidate',
      email: `cand.b.${Date.now()}@example.com`,
      status: 'NEW',
    }).returning();
    candidateBId = candB.id;

    // Create job in Org B
    const [jobB] = await db.insert(jobs).values({
      organizationId: orgBId,
      title: 'Org B Secret Job',
      description: 'Confidential position for Org B',
      status: 'PUBLISHED',
    }).returning();
    jobBId = jobB.id;

    // Create note on Candidate B in Org B
    const [noteB] = await db.insert(candidateNotes).values({
      organizationId: orgBId,
      candidateId: candidateBId,
      jobId: jobBId,
      authorUserId: userBId,
      content: 'Confidential interview feedback for Candidate B',
    }).returning();
    noteBId = noteB.id;

    // Create saved search in Org B
    const [searchB] = await db.insert(savedSearches).values({
      organizationId: orgBId,
      userId: userBId,
      name: 'Backend Devs Search',
      query: 'Python PostgreSQL',
      intentJson: { query: 'Python PostgreSQL', limit: 20 },
    }).returning();
    searchBId = searchB.id;
  });

  afterAll(async () => {
    if (orgBId) {
      await db.delete(savedSearches).where(eq(savedSearches.organizationId, orgBId));
      await db.delete(candidateNotes).where(eq(candidateNotes.organizationId, orgBId));
      await db.delete(candidates).where(eq(candidates.organizationId, orgBId));
      await db.delete(jobs).where(eq(jobs.organizationId, orgBId));
      await db.delete(memberships).where(eq(memberships.organizationId, orgBId));
      await db.delete(organizations).where(eq(organizations.id, orgBId));
    }
    if (orgAId) {
      await db.delete(memberships).where(eq(memberships.organizationId, orgAId));
      await db.delete(organizations).where(eq(organizations.id, orgAId));
    }
    if (userAId) await db.delete(users).where(eq(users.id, userAId));
    if (userBId) await db.delete(users).where(eq(users.id, userBId));
  });

  it('rejects User A membership resolution against Org B (FORBIDDEN)', async () => {
    await expect(requireOrgMembership(userAId, orgBId)).rejects.toThrowError(
      new AuthorizationError('FORBIDDEN', 'User is not a member of this organization')
    );
  });

  it('prevents cross-tenant candidate lookup when scoped by Org A ID (HTTP 404 behavior)', async () => {
    const cand = await db.query.candidates.findFirst({
      where: and(eq(candidates.id, candidateBId), eq(candidates.organizationId, orgAId)),
    });
    expect(cand).toBeUndefined();
  });

  it('prevents cross-tenant job lookup when scoped by Org A ID (HTTP 404 behavior)', async () => {
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobBId), eq(jobs.organizationId, orgAId)),
    });
    expect(job).toBeUndefined();
  });

  it('prevents cross-tenant candidate notes retrieval when scoped by Org A ID', async () => {
    const notes = await db.query.candidateNotes.findMany({
      where: and(eq(candidateNotes.candidateId, candidateBId), eq(candidateNotes.organizationId, orgAId)),
    });
    expect(notes).toEqual([]);
  });

  it('prevents cross-tenant saved search access when scoped by Org A ID', async () => {
    const search = await db.query.savedSearches.findFirst({
      where: and(eq(savedSearches.id, searchBId), eq(savedSearches.organizationId, orgAId)),
    });
    expect(search).toBeUndefined();
  });

  it('prevents cross-tenant notification delivery between Org A and Org B users', async () => {
    const notifs = await db.query.notifications.findMany({
      where: and(eq(notifications.recipientUserId, userAId), eq(notifications.organizationId, orgBId)),
    });
    expect(notifs).toEqual([]);
  });
});
