import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, users, organizations, memberships, candidates, candidateDocuments, candidateProfiles, auditLogs, eq } from '../../src/db';
import { processCandidateResumeDirectly } from '../../src/services/queue';
import { getStorage } from '../../src/lib/storage';

import { TestAIProvider } from '../../src/lib/ai/provider';

describe('Phase 4D — BullMQ Queue Reliability & Error Handling', () => {
  const testOrgSlug = `queue-test-org-${Date.now()}`;
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    // Ensure AI provider mock is initialized for unit/integration testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__TEST_AI_PROVIDER__ = new TestAIProvider();
    // Setup test organization and user
    const [user] = await db.insert(users).values({
      name: 'Queue Test Recruiter',
      email: `queue.recruiter.${Date.now()}@example.com`,
      passwordHash: 'hashed-password-123',
    }).returning();
    testUserId = user.id;

    const [org] = await db.insert(organizations).values({
      name: 'Queue Test Org',
      slug: testOrgSlug,
    }).returning();
    testOrgId = org.id;

    await db.insert(memberships).values({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'OWNER',
    });
  });

  afterAll(async () => {
    // Cleanup scoped database records
    if (testOrgId) {
      await db.delete(auditLogs).where(eq(auditLogs.organizationId, testOrgId));
      await db.delete(candidateProfiles).where(eq(candidateProfiles.organizationId, testOrgId));
      await db.delete(candidateDocuments).where(eq(candidateDocuments.organizationId, testOrgId));
      await db.delete(candidates).where(eq(candidates.organizationId, testOrgId));
      await db.delete(memberships).where(eq(memberships.organizationId, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('processes valid resume job successfully and creates candidate profile', async () => {
    // Create candidate & document
    const [candidate] = await db.insert(candidates).values({
      organizationId: testOrgId,
      firstName: 'Queue',
      lastName: 'Candidate A',
      email: `queue.cand.a.${Date.now()}@example.com`,
      status: 'NEW',
    }).returning();

    const storageKey = `${testOrgId}/${candidate.id}/resume.pdf`;
    const mockResumeText = 'This is a mock resume text. Senior Backend Engineer with 8 years of TypeScript, Node.js, PostgreSQL, and Redis experience.';
    await getStorage().uploadFile(storageKey, Buffer.from(mockResumeText), 'application/pdf');

    const [doc] = await db.insert(candidateDocuments).values({
      candidateId: candidate.id,
      organizationId: testOrgId,
      fileName: 'resume.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storageKey,
      rawText: mockResumeText,
    }).returning();

    await processCandidateResumeDirectly({
      candidateId: candidate.id,
      organizationId: testOrgId,
      storageKey,
      mimeType: 'application/pdf',
    });

    // Verify candidate profile created
    const profile = await db.query.candidateProfiles.findFirst({
      where: eq(candidateProfiles.candidateId, candidate.id),
    });

    expect(profile).toBeDefined();
    expect(profile?.organizationId).toBe(testOrgId);
  });

  it('handles scanned/image-only PDF failure and creates audit log error record', async () => {
    const [candidate] = await db.insert(candidates).values({
      organizationId: testOrgId,
      firstName: 'Scanned PDF',
      lastName: 'Candidate',
      email: `scanned.cand.${Date.now()}@example.com`,
      status: 'NEW',
    }).returning();

    const storageKey = `${testOrgId}/${candidate.id}/scanned.pdf`;
    await getStorage().uploadFile(storageKey, Buffer.from('scanned/short text content'), 'application/pdf');

    const [doc] = await db.insert(candidateDocuments).values({
      candidateId: candidate.id,
      organizationId: testOrgId,
      fileName: 'scanned_image.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      storageKey,
      rawText: 'Too short', // Under 100 characters minimum threshold
    }).returning();

    await expect(processCandidateResumeDirectly({
      candidateId: candidate.id,
      organizationId: testOrgId,
      storageKey,
      mimeType: 'application/pdf',
    })).rejects.toThrow(/Scanned\/image-only PDF could not be text-extracted; OCR is required/);

    // Verify audit log has recorded the failure cleanly
    const auditRecord = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.organizationId, testOrgId),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    });

    expect(auditRecord).toBeDefined();
    expect(auditRecord?.action).toBe('DOCUMENT_PROCESSING_FAILED');
  });
});
