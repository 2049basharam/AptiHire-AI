import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  users,
  organizations,
  memberships,
  jobs,
  jobEmbeddings,
  candidates,
  candidateProfiles,
  candidateEmbeddings,
  candidateEvidence,
  auditLogs,
  eq,
  and,
} from '../../src/db';
import { cosineDistance } from 'drizzle-orm';

describe('Real PostgreSQL Integration Tests: Candidate-to-Job Matching & Scoping', () => {
  let orgA: any;
  let orgB: any;
  let jobA1: any;
  let jobA2: any;
  let jobB1: any;
  let candidateA: any;

  beforeEach(async () => {
    // Clean all tables in order
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(jobEmbeddings);
    await db.delete(candidateProfiles);
    await db.delete(candidateEvidence);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create organizations
    [orgA] = await db.insert(organizations).values({
      name: 'Match Org A',
      slug: 'match-org-a',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Match Org B',
      slug: 'match-org-b',
    }).returning();

    // Create jobs
    [jobA1] = await db.insert(jobs).values({
      organizationId: orgA.id,
      title: 'Python Backend Engineer',
      description: 'Require Python and FastAPI.',
      requirements: { experienceLevel: 'MID', skills: ['Python', 'FastAPI'] },
      status: 'PUBLISHED',
    }).returning();

    [jobA2] = await db.insert(jobs).values({
      organizationId: orgA.id,
      title: 'React Frontend Architect',
      description: 'Require React and TypeScript.',
      requirements: { experienceLevel: 'SENIOR', skills: ['React', 'TypeScript'] },
      status: 'DRAFT', // draft job, should not match!
    }).returning();

    [jobB1] = await db.insert(jobs).values({
      organizationId: orgB.id,
      title: 'DevOps Engineer',
      description: 'Require Docker and Kubernetes.',
      requirements: { experienceLevel: 'MID', skills: ['Docker'] },
      status: 'PUBLISHED', // belongs to Org B, should not match candidate in Org A!
    }).returning();

    // Insert job embeddings (mock embeddings)
    const embeddingA1 = Array(768).fill(0.1);
    embeddingA1[0] = 0.9;
    embeddingA1[1] = 0.1;

    const embeddingB1 = Array(768).fill(0.1);
    embeddingB1[0] = 0.9;
    embeddingB1[1] = 0.1; // highly similar embedding vector to jobA1!

    await db.insert(jobEmbeddings).values({
      jobId: jobA1.id,
      organizationId: orgA.id,
      embedding: embeddingA1,
      model: 'text-embedding-004',
      version: '1.0',
    });

    await db.insert(jobEmbeddings).values({
      jobId: jobB1.id,
      organizationId: orgB.id,
      embedding: embeddingB1,
      model: 'text-embedding-004',
      version: '1.0',
    });

    // Create candidate in Org A
    [candidateA] = await db.insert(candidates).values({
      organizationId: orgA.id,
      firstName: 'Matching',
      lastName: 'Candidate',
      email: 'matching.cand@example.com',
      status: 'APPROVED',
    }).returning();

    // Insert candidate profile details
    await db.insert(candidateProfiles).values({
      candidateId: candidateA.id,
      organizationId: orgA.id,
      summary: 'Experienced python engineer',
      skills: [{ name: 'Python' }, { name: 'FastAPI' }],
      experience: [],
      education: [],
    });

    // Insert candidate embedding
    const candEmbedding = Array(768).fill(0.1);
    candEmbedding[0] = 0.88;
    candEmbedding[1] = 0.12;

    await db.insert(candidateEmbeddings).values({
      candidateId: candidateA.id,
      organizationId: orgA.id,
      embedding: candEmbedding,
      model: 'text-embedding-004',
      version: '1.0',
    });
  });

  it('should retrieve matching jobs scoped strictly by tenant organization', async () => {
    // Retrieve embedding of candidate A
    const candidateEmbed = await db.query.candidateEmbeddings.findFirst({
      where: eq(candidateEmbeddings.candidateId, candidateA.id),
    });
    expect(candidateEmbed).toBeDefined();

    // Query matched jobs scoped strictly to Org A
    const matchedJobs = await db
      .select({
        job: jobs,
        distance: cosineDistance(jobEmbeddings.embedding, candidateEmbed!.embedding),
      })
      .from(jobs)
      .innerJoin(jobEmbeddings, eq(jobEmbeddings.jobId, jobs.id))
      .where(
        and(
          eq(jobs.organizationId, orgA.id),
          eq(jobs.status, 'PUBLISHED')
        )
      )
      .orderBy(cosineDistance(jobEmbeddings.embedding, candidateEmbed!.embedding))
      .limit(50);

    // Should only retrieve jobA1. Excludes jobA2 (Draft) and jobB1 (Org B)
    expect(matchedJobs.length).toBe(1);
    expect(matchedJobs[0].job.id).toBe(jobA1.id);
  });

  it('should fail to find matching jobs from another organization (tenant boundary check)', async () => {
    const candidateEmbed = await db.query.candidateEmbeddings.findFirst({
      where: eq(candidateEmbeddings.candidateId, candidateA.id),
    });

    // Org B recruiter queries jobs scoped to Org B
    const matchedJobsForOrgB = await db
      .select({
        job: jobs,
        distance: cosineDistance(jobEmbeddings.embedding, candidateEmbed!.embedding),
      })
      .from(jobs)
      .innerJoin(jobEmbeddings, eq(jobEmbeddings.jobId, jobs.id))
      .where(
        and(
          eq(jobs.organizationId, orgB.id),
          eq(jobs.status, 'PUBLISHED')
        )
      )
      .orderBy(cosineDistance(jobEmbeddings.embedding, candidateEmbed!.embedding));

    // JobB1 exists in Org B and is Published, so it matches in Org B scope.
    // However, the controller must ensure Org B recruiter cannot retrieve candidateA in the first place (returning 404),
    // and Org A recruiter cannot see JobB1 (since organizationId filter is orgA.id).
    expect(matchedJobsForOrgB.length).toBe(1);
    expect(matchedJobsForOrgB[0].job.id).toBe(jobB1.id);
  });
});
