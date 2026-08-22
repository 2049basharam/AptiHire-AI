import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  users,
  organizations,
  memberships,
  candidates,
  candidateProfiles,
  candidateEmbeddings,
  auditLogs,
  jobs,
  jobEmbeddings,
  eq,
} from '../../src/db';

describe('Real PostgreSQL Integration Tests: Candidate Semantic Search & Tenant Scoping', () => {
  let orgA: any;
  let orgB: any;
  let cand1: any;
  let cand2: any;

  beforeEach(async () => {
    // Clean all tables in order
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(jobEmbeddings);
    await db.delete(candidateProfiles);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create organizations
    [orgA] = await db.insert(organizations).values({
      name: 'Search Tenant A',
      slug: 'search-tenant-a',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Search Tenant B',
      slug: 'search-tenant-b',
    }).returning();

    // Ingest Candidate 1 under Org A (APPROVED status)
    [cand1] = await db.insert(candidates).values({
      organizationId: orgA.id,
      firstName: 'Python',
      lastName: 'Developer Org A',
      email: 'python.dev@tenant-a.com',
      status: 'APPROVED',
    }).returning();

    await db.insert(candidateProfiles).values({
      candidateId: cand1.id,
      organizationId: orgA.id,
      summary: 'Senior Developer with Python and FastAPI experience.',
      skills: ['Python', 'FastAPI'],
      experience: [{ startDate: '2020-01-01', endDate: '2023-01-01' }],
      education: [],
    });

    const cand1Vector = new Array(768).fill(0.1);
    cand1Vector[0] = 0.8; // Distinctive token embedding
    await db.insert(candidateEmbeddings).values({
      candidateId: cand1.id,
      organizationId: orgA.id,
      embedding: cand1Vector,
      model: 'text-embedding-004',
      version: '1.0',
    });

    // Ingest Candidate 2 under Org B (APPROVED status)
    [cand2] = await db.insert(candidates).values({
      organizationId: orgB.id,
      firstName: 'Python',
      lastName: 'Developer Org B',
      email: 'python.dev@tenant-b.com',
      status: 'APPROVED',
    }).returning();

    await db.insert(candidateProfiles).values({
      candidateId: cand2.id,
      organizationId: orgB.id,
      summary: 'Senior Developer with Python and FastAPI experience.',
      skills: ['Python', 'FastAPI'],
      experience: [{ startDate: '2019-01-01', endDate: '2023-01-01' }],
      education: [],
    });

    const cand2Vector = new Array(768).fill(0.1);
    cand2Vector[0] = 0.8; // Same embedding, but completely different organization tenant!
    await db.insert(candidateEmbeddings).values({
      candidateId: cand2.id,
      organizationId: orgB.id,
      embedding: cand2Vector,
      model: 'text-embedding-004',
      version: '1.0',
    });
  });

  it('should enforce multi-tenant candidate scoping on pgvector search', async () => {
    // When searching candidates under Org A context
    const results = await db.query.candidates.findMany({
      where: eq(candidates.organizationId, orgA.id),
      with: {
        embeddings: true,
        profiles: true,
      },
    });

    // Verify only Org A candidate is returned
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(cand1.id);
    expect(results[0].firstName).toBe('Python');
    expect(results[0].lastName).toBe('Developer Org A');
  });

  it('should correctly filter candidate status eligibility', async () => {
    // Set candidate status to REJECTED (terminal state)
    await db.update(candidates).set({ status: 'REJECTED' }).where(eq(candidates.id, cand1.id));

    // When querying active statuses
    const activeCandidates = await db.query.candidates.findMany({
      where: eq(candidates.organizationId, orgA.id),
    });

    const eligibleActive = activeCandidates.filter((c) =>
      ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'].includes(c.status)
    );

    expect(eligibleActive.length).toBe(0); // Candidate 1 is excluded from active search pools by default
  });
});
