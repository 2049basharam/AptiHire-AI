import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db, users, organizations, memberships, candidates, jobs, candidateNotes, candidateStatusHistory, eq } from '@/db';
import { signToken } from '@/lib/auth';

let activeSessionToken = '';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'session' ? { value: activeSessionToken } : undefined),
  }),
}));

import { GET as getActivity } from '@/app/api/activity/route';

describe('Activity Keyset Pagination & Index Integration Tests', () => {
  let testUserId: string;
  let testOrgId: string;
  let testCandidateId: string;
  let testJobId: string;

  beforeAll(async () => {
    // 1. Create test user and organization
    const [user] = await db.insert(users).values({
      email: `perf-test-${Date.now()}@example.com`,
      name: 'Perf Test Recruiter',
      passwordHash: 'hash',
    }).returning();
    testUserId = user.id;

    const [org] = await db.insert(organizations).values({
      name: `Perf Org ${Date.now()}`,
      slug: `perf-org-${Date.now()}`,
    }).returning();
    testOrgId = org.id;

    await db.insert(memberships).values({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'RECRUITER',
    });

    const [job] = await db.insert(jobs).values({
      organizationId: testOrgId,
      title: 'Senior Performance Engineer',
      description: 'Test job description',
      status: 'PUBLISHED',
    }).returning();
    testJobId = job.id;

    const [cand] = await db.insert(candidates).values({
      organizationId: testOrgId,
      firstName: 'Jane',
      lastName: 'Perf',
      email: `jane.perf.${Date.now()}@example.com`,
      status: 'APPROVED',
    }).returning();
    testCandidateId = cand.id;

    // 2. Populate test notes and status history records
    const now = new Date();
    for (let i = 1; i <= 5; i++) {
      const pastDate = new Date(now.getTime() - i * 60000);
      await db.insert(candidateNotes).values({
        organizationId: testOrgId,
        candidateId: testCandidateId,
        jobId: testJobId,
        authorUserId: testUserId,
        content: `Test Note ${i}`,
        createdAt: pastDate,
      });

      await db.insert(candidateStatusHistory).values({
        organizationId: testOrgId,
        candidateId: testCandidateId,
        jobId: testJobId,
        actorUserId: testUserId,
        newStatus: i % 2 === 0 ? 'INTERVIEW' : 'SHORTLISTED',
        createdAt: pastDate,
      });
    }

    activeSessionToken = await signToken({ userId: testUserId });
  });

  afterAll(async () => {
    // Cleanup only this test's specific organization records
    await db.delete(candidateNotes).where(eq(candidateNotes.organizationId, testOrgId));
    await db.delete(candidateStatusHistory).where(eq(candidateStatusHistory.organizationId, testOrgId));
    await db.delete(candidates).where(eq(candidates.organizationId, testOrgId));
    await db.delete(jobs).where(eq(jobs.organizationId, testOrgId));
    await db.delete(memberships).where(eq(memberships.organizationId, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should retrieve activity items ordered deterministically by created_at DESC, id DESC', async () => {
    const req = new Request(`http://localhost/api/activity?limit=4`);

    const response = await getActivity(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.items).toBeDefined();
    expect(json.data.items.length).toBe(4);
    expect(json.data.hasMore).toBe(true);

    // Verify ordering
    const items = json.data.items;
    for (let i = 0; i < items.length - 1; i++) {
      const t1 = new Date(items[i].createdAt).getTime();
      const t2 = new Date(items[i + 1].createdAt).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });

  it('should perform keyset pagination using cursorCreatedAt and cursorId without duplication', async () => {
    // Page 1
    const req1 = new Request(`http://localhost/api/activity?limit=3`);
    const res1 = await getActivity(req1);
    const json1 = await res1.json();

    expect(json1.data.items.length).toBe(3);
    expect(json1.data.nextCursor).toBeDefined();

    const cursor = json1.data.nextCursor;

    // Page 2
    const req2 = new Request(`http://localhost/api/activity?limit=3&cursorCreatedAt=${encodeURIComponent(cursor.createdAt)}&cursorId=${cursor.id}`);
    const res2 = await getActivity(req2);
    const json2 = await res2.json();

    expect(json2.data.items.length).toBeGreaterThan(0);

    // Ensure no IDs overlap between Page 1 and Page 2
    const page1Ids = new Set(json1.data.items.map((it: { id: string }) => it.id));
    for (const item of json2.data.items) {
      expect(page1Ids.has(item.id)).toBe(false);
    }
  });
});
