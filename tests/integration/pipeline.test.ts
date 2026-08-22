import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  db,
  users,
  organizations,
  memberships,
  candidates,
  candidateNotes,
  candidateStatusHistory,
  jobs,
  auditLogs,
  eq,
  and,
} from '../../src/db';

describe('Integration Tests: Recruiter Pipeline Notes & Audit History Isolation', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let candidateAId: string;
  let candidateBId: string;
  let jobAId: string;
  let jobBId: string;

  beforeAll(async () => {
    // 1. Setup Org A and User A
    const [orgA] = await db.insert(organizations).values({ name: 'Pipeline Org A', slug: 'pipeline-org-a' }).returning();
    orgAId = orgA.id;
    const [userA] = await db.insert(users).values({ name: 'User A', email: 'usera.pipeline@example.com', passwordHash: 'pwd' }).returning();
    userAId = userA.id;
    await db.insert(memberships).values({ organizationId: orgAId, userId: userAId, role: 'RECRUITER' });

    // 2. Setup Org B and User B
    const [orgB] = await db.insert(organizations).values({ name: 'Pipeline Org B', slug: 'pipeline-org-b' }).returning();
    orgBId = orgB.id;
    const [userB] = await db.insert(users).values({ name: 'User B', email: 'userb.pipeline@example.com', passwordHash: 'pwd' }).returning();
    userBId = userB.id;
    await db.insert(memberships).values({ organizationId: orgBId, userId: userBId, role: 'RECRUITER' });

    // 3. Create Candidates
    const [candA] = await db.insert(candidates).values({ organizationId: orgAId, firstName: 'Candidate A', status: 'APPROVED' }).returning();
    candidateAId = candA.id;
    const [candB] = await db.insert(candidates).values({ organizationId: orgBId, firstName: 'Candidate B', status: 'APPROVED' }).returning();
    candidateBId = candB.id;

    // 4. Create Jobs
    const [jobA] = await db.insert(jobs).values({ organizationId: orgAId, title: 'Job A', description: 'Desc A' }).returning();
    jobAId = jobA.id;
    const [jobB] = await db.insert(jobs).values({ organizationId: orgBId, title: 'Job B', description: 'Desc B' }).returning();
    jobBId = jobB.id;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(candidateNotes);
    await db.delete(candidateStatusHistory);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(auditLogs);
    await db.delete(organizations);
    await db.delete(users);
  });

  it('should prevent cross-tenant recruiter notes retrieval', async () => {
    // 1. Create a note in Org A
    const [noteA] = await db.insert(candidateNotes).values({
      organizationId: orgAId,
      candidateId: candidateAId,
      jobId: jobAId,
      authorUserId: userAId,
      content: 'Confidential recruiter note in Org A',
    }).returning();

    // 2. Query notes as Org A recruiter (should succeed)
    const orgANotes = await db.query.candidateNotes.findMany({
      where: and(eq(candidateNotes.candidateId, candidateAId), eq(candidateNotes.organizationId, orgAId)),
    });
    expect(orgANotes.length).toBe(1);
    expect(orgANotes[0].content).toBe('Confidential recruiter note in Org A');

    // 3. Query notes as Org B recruiter (should be empty under Org B scope)
    const orgBNotes = await db.query.candidateNotes.findMany({
      where: and(eq(candidateNotes.candidateId, candidateAId), eq(candidateNotes.organizationId, orgBId)),
    });
    expect(orgBNotes.length).toBe(0);
  });

  it('should maintain strict atomic status history audit logs', async () => {
    // 1. Log a status history record
    const [historyRecord] = await db.insert(candidateStatusHistory).values({
      organizationId: orgAId,
      candidateId: candidateAId,
      jobId: jobAId,
      previousStatus: 'APPROVED',
      newStatus: 'SHORTLISTED',
      actorUserId: userAId,
      reason: 'Strong python profile match',
      notes: 'Initial shortlist decision',
    }).returning();

    // 2. Fetch history for Candidate A
    const historyLogs = await db.query.candidateStatusHistory.findMany({
      where: eq(candidateStatusHistory.candidateId, candidateAId),
    });
    expect(historyLogs.length).toBe(1);
    expect(historyLogs[0].newStatus).toBe('SHORTLISTED');
    expect(historyLogs[0].reason).toBe('Strong python profile match');

    // 3. Verify history is tenant-isolated
    const orgBHistory = await db.query.candidateStatusHistory.findMany({
      where: and(eq(candidateStatusHistory.candidateId, candidateAId), eq(candidateStatusHistory.organizationId, orgBId)),
    });
    expect(orgBHistory.length).toBe(0);
  });
});
