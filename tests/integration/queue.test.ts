import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { addVerificationJob, startVerificationWorker, verificationQueue, queueEvents, addCandidateJob, startCandidateWorker, candidateQueue, candidateQueueEvents } from '../../src/services/queue';
import { db, users, organizations, candidates, candidateDocuments, candidateProfiles, candidateEvidence, auditLogs, jobs, jobEmbeddings, eq } from '../../src/db';
import { getStorage } from '../../src/lib/storage';

describe('Integration: Redis & BullMQ Infrastructure', () => {
  let user: any;
  let org: any;

  beforeAll(async () => {
    // Start the workers to process jobs
    startVerificationWorker();
    startCandidateWorker();

    // Clean DB
    await db.delete(auditLogs);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobEmbeddings);
    await db.delete(jobs);
    await db.delete(organizations);
    await db.delete(users);

    // Setup user & org
    [user] = await db.insert(users).values({
      name: 'Queue tester',
      email: 'queue@example.com',
      passwordHash: 'hash'
    }).returning();

    [org] = await db.insert(organizations).values({
      name: 'Queue Org',
      slug: 'queue-org'
    }).returning();

    // Inject mock AI provider
    (global as any).__TEST_AI_PROVIDER__ = true;
  });

  afterAll(async () => {
    // Clean up queue connections
    await verificationQueue.close();
    await queueEvents.close();
    await candidateQueue.close();
    await candidateQueueEvents.close();
    delete (global as any).__TEST_AI_PROVIDER__;
  });

  it('should successfully submit and process a verification job using real Redis', async () => {
    const job = await addVerificationJob('Real infrastructure test', false);
    expect(job.id).toBeDefined();

    // Poll job status until it is completed by the worker
    let status = await job.getState();
    let retries = 15;
    while (status !== 'completed' && status !== 'failed' && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      status = await job.getState();
      retries--;
    }

    expect(status).toBe('completed');
  });

  it('should successfully submit, parse, and extract candidate profile via BullMQ worker', async () => {
    const mockPdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF signature
      Buffer.from('\nThis is a mock resume text with Python and PostgreSQL experience. It contains a lot of additional filler text to bypass the minimum 100 characters length requirement of the candidate ingestion worker pipeline.\n')
    ]);


    const storageKey = 'queue-test-key.pdf';
    const storage = getStorage();
    await storage.uploadFile(storageKey, mockPdfBuffer, 'application/pdf');

    // 2. Insert candidate and document metadata in DB (ensuring org exists)
    let activeOrg = await db.query.organizations.findFirst({ where: eq(organizations.id, org.id) });
    if (!activeOrg) {
      [activeOrg] = await db.insert(organizations).values({
        id: org.id,
        name: 'Queue Org',
        slug: `queue-org-${Date.now()}`,
      }).returning();
    }

    const [candidate] = await db.insert(candidates).values({
      organizationId: activeOrg.id,
      status: 'UPLOADED'
    }).returning();

    await db.insert(candidateDocuments).values({
      candidateId: candidate.id,
      organizationId: org.id,
      fileName: 'test-resume.pdf',
      fileSize: mockPdfBuffer.length,
      mimeType: 'application/pdf',
      storageKey,
      rawText: ''
    });

    // 3. Enqueue job
    const job = await addCandidateJob(candidate.id, org.id, storageKey, 'application/pdf');
    expect(job.id).toBeDefined();

    // 4. Poll job status
    let status = await job.getState();
    let retries = 20;
    while (status !== 'completed' && status !== 'failed' && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      status = await job.getState();
      retries--;
    }

    expect(status).toBe('completed');

    // 5. Query candidate record and verify worker transitions & extractions
    const candidateRecord = await db.query.candidates.findFirst({
      where: eq(candidates.id, candidate.id),
      with: {
        documents: true,
        profiles: true,
        evidence: true
      }
    });

    expect(candidateRecord).toBeDefined();
    expect(candidateRecord?.status).toBe('REVIEW_REQUIRED');
    expect(candidateRecord?.documents[0].rawText).toContain('Python and PostgreSQL');
    expect(candidateRecord?.profiles[0].skills).toContain('Python');
    expect(candidateRecord?.evidence[0].skill).toBe('Python');
    expect(candidateRecord?.evidence[0].excerpt).toBe('Developed core API services in Python');
  });
});
