import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, users, organizations, memberships, candidates, candidateDocuments, candidateProfiles, candidateEvidence, candidateEmbeddings, auditLogs, eq, and } from '../../src/db';
import { cosineDistance } from 'drizzle-orm';

describe('Real PostgreSQL Integration Tests: Candidate & Resume Ingestion', () => {
  let recruiterUser: any;
  let organizationA: any;
  let organizationB: any;

  beforeEach(async () => {
    // Clean all tables
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create user
    [recruiterUser] = await db.insert(users).values({
      name: 'Recruiter Admin',
      email: 'recruiter@example.com',
      passwordHash: 'hashed_password'
    }).returning();

    // Create Orgs
    [organizationA] = await db.insert(organizations).values({
      name: 'Tenant Org A',
      slug: 'org-a'
    }).returning();

    [organizationB] = await db.insert(organizations).values({
      name: 'Tenant Org B',
      slug: 'org-b'
    }).returning();

    // Create membership in Org A
    await db.insert(memberships).values({
      userId: recruiterUser.id,
      organizationId: organizationA.id,
      role: 'RECRUITER'
    });
  });

  it('should successfully write candidate, documents, profile, and evidence in a tenant-isolated environment', async () => {
    // 1. Create candidate in Org A
    const [candidate] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      status: 'REVIEW_REQUIRED'
    }).returning();

    // 2. Create associated document
    const [doc] = await db.insert(candidateDocuments).values({
      candidateId: candidate.id,
      organizationId: organizationA.id,
      fileName: 'resume.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storageKey: 'file-uuid-key.pdf',
      rawText: 'Alice has skills in Python and TypeScript.'
    }).returning();

    // 3. Create parsed profile
    await db.insert(candidateProfiles).values({
      candidateId: candidate.id,
      organizationId: organizationA.id,
      summary: 'Senior developer',
      experience: [],
      education: [],
      skills: ['Python', 'TypeScript']
    });

    // 4. Create evidence
    await db.insert(candidateEvidence).values({
      candidateId: candidate.id,
      organizationId: organizationA.id,
      skill: 'Python',
      sourceDocumentId: doc.id,
      excerpt: 'skills in Python',
      page: null
    });

    // Verify all records exist and are correctly linked
    const result = await db.query.candidates.findFirst({
      where: eq(candidates.id, candidate.id),
      with: {
        documents: true,
        profiles: true,
        evidence: true
      }
    });

    expect(result).toBeDefined();
    expect(result?.firstName).toBe('Alice');
    expect(result?.documents[0].fileName).toBe('resume.pdf');
    expect(result?.profiles[0].skills).toContain('Python');
    expect(result?.evidence[0].excerpt).toBe('skills in Python');
  });

  it('should prevent cross-tenant queries from retrieving candidate data', async () => {
    // Create candidate in Org A
    const [candidate] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Alice',
      status: 'UPLOADED'
    }).returning();

    // Query candidate scoped to Org B
    const crossTenantSearch = await db.query.candidates.findFirst({
      where: and(
        eq(candidates.id, candidate.id),
        eq(candidates.organizationId, organizationB.id) // Querying under Tenant Org B
      )
    });

    expect(crossTenantSearch).toBeUndefined(); // Should fail closed
  });

  it('should successfully store and retrieve pgvector embeddings using cosine similarity', async () => {
    // Create candidate in Org A
    const [candidate] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Alice',
      status: 'APPROVED'
    }).returning();

    // Generate two 768-dimensional float arrays
    // Vector A representing backend Python dev
    const vectorA = new Array(768).fill(0.1);
    vectorA[0] = 0.9;
    vectorA[1] = 0.8;

    // Vector B representing general dev
    const vectorB = new Array(768).fill(0.1);
    vectorB[0] = 0.2;
    vectorB[1] = 0.2;

    // Insert vector A
    await db.insert(candidateEmbeddings).values({
      candidateId: candidate.id,
      organizationId: organizationA.id,
      embedding: vectorA,
      model: 'text-embedding-004',
      version: '1.0'
    });

    // Query candidate embedding using cosine similarity check
    // Cosine distance maps to <=> operator in PostgreSQL
    const matches = await db.select({
      candidateId: candidateEmbeddings.candidateId,
      distance: cosineDistance(candidateEmbeddings.embedding, vectorA)
    })
    .from(candidateEmbeddings)
    .orderBy(cosineDistance(candidateEmbeddings.embedding, vectorA))
    .limit(1);

    expect(matches.length).toBe(1);
    expect(matches[0].candidateId).toBe(candidate.id);
    expect(matches[0].distance).toBeLessThan(0.01); // Distance to itself should be extremely close to 0

    // Compare distance to vector B (should be larger distance)
    const matchesB = await db.select({
      distance: cosineDistance(candidateEmbeddings.embedding, vectorB)
    })
    .from(candidateEmbeddings)
    .limit(1);

    expect(matchesB[0].distance).toBeGreaterThan(0.01);
  });
});
