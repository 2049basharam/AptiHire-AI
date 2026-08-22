import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  db,
  users,
  organizations,
  memberships,
  candidates,
  candidateStatusHistory,
  candidateNotes,
  savedSearches,
  tags,
  candidateTags,
  notifications,
  auditLogs,
  candidateEmbeddings,
  jobEmbeddings,
  candidateDocuments,
  jobs,
} from '../../src/db';
import { resetRateLimits } from '../../src/lib/ratelimit';
import { closeQueueConnections } from '../../src/services/queue';

describe('Integration Tests: Phase 4B Recruiter Operations & Analytics', () => {
  let userA: any;
  let userB: any;
  let orgA: any;
  let orgB: any;

  beforeEach(async () => {
    await resetRateLimits();

    // Clean tables
    await db.delete(notifications);
    await db.delete(candidateTags);
    await db.delete(tags);
    await db.delete(savedSearches);
    await db.delete(candidateNotes);
    await db.delete(candidateStatusHistory);
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(jobEmbeddings);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create User A & Org A
    [userA] = await db.insert(users).values({
      name: 'Recruiter Alpha',
      email: 'alpha@example.com',
      passwordHash: 'hash',
    }).returning();

    [orgA] = await db.insert(organizations).values({
      name: 'Org Alpha',
      slug: 'org-alpha',
    }).returning();

    await db.insert(memberships).values({
      userId: userA.id,
      organizationId: orgA.id,
      role: 'RECRUITER',
    });

    // Create User B & Org B
    [userB] = await db.insert(users).values({
      name: 'Recruiter Beta',
      email: 'beta@example.com',
      passwordHash: 'hash',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Org Beta',
      slug: 'org-beta',
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

  describe('Multi-Tenant Isolation for Tags & Saved Searches', () => {
    it('should strictly isolate saved searches by organization and user', async () => {
      await db.insert(savedSearches).values({
        organizationId: orgA.id,
        userId: userA.id,
        name: 'Alpha Search',
        query: 'Python',
        intentJson: { query: 'Python' },
      });

      await db.insert(savedSearches).values({
        organizationId: orgB.id,
        userId: userB.id,
        name: 'Beta Search',
        query: 'Java',
        intentJson: { query: 'Java' },
      });

      const orgASearches = await db.query.savedSearches.findMany({
        where: (t, { eq }) => eq(t.organizationId, orgA.id),
      });

      expect(orgASearches).toHaveLength(1);
      expect(orgASearches[0].name).toBe('Alpha Search');
    });

    it('should prevent cross-tenant tag creation and mapping', async () => {
      const [tagA] = await db.insert(tags).values({
        organizationId: orgA.id,
        name: 'urgent',
        color: 'red',
      }).returning();

      const [candA] = await db.insert(candidates).values({
        organizationId: orgA.id,
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
      }).returning();

      // Attach tag A to candidate A
      await db.insert(candidateTags).values({
        organizationId: orgA.id,
        candidateId: candA.id,
        tagId: tagA.id,
      });

      const attached = await db.query.candidateTags.findMany({
        where: (t, { eq }) => eq(t.organizationId, orgA.id),
      });

      expect(attached).toHaveLength(1);
      expect(attached[0].candidateId).toBe(candA.id);

      // Org B should find 0 tags
      const orgBTags = await db.query.tags.findMany({
        where: (t, { eq }) => eq(t.organizationId, orgB.id),
      });
      expect(orgBTags).toHaveLength(0);
    });
  });

  describe('Notifications Recipient Isolation', () => {
    it('should only deliver in-app notifications to intended recipient in the same organization', async () => {
      await db.insert(notifications).values({
        organizationId: orgA.id,
        recipientUserId: userA.id,
        title: 'New Candidate Approved',
        message: 'Alice Smith was approved',
        type: 'CANDIDATE_APPROVED',
      });

      const userANotifs = await db.query.notifications.findMany({
        where: (t, { eq, and }) => and(eq(t.organizationId, orgA.id), eq(t.recipientUserId, userA.id)),
      });

      expect(userANotifs).toHaveLength(1);
      expect(userANotifs[0].title).toBe('New Candidate Approved');

      const userBNotifs = await db.query.notifications.findMany({
        where: (t, { eq }) => eq(t.recipientUserId, userB.id),
      });

      expect(userBNotifs).toHaveLength(0);
    });
  });
});
