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
  candidateDocuments,
  eq,
  and,
} from '../../src/db';
import { calculateDetailedMatchScore } from '../../src/lib/matching';
import { JobRequirements } from '../../src/lib/validations/job';
import { ExtractedProfile } from '../../src/lib/validations/candidate';
import { inArray } from 'drizzle-orm';

describe('Integration Tests: Candidate Comparison Database Queries & Tenant Scoping', () => {
  let orgA: any;
  let orgB: any;
  let jobA: any;
  let jobB: any;
  let candA1: any;
  let candA2: any;
  let candB: any;
  let docA1: any;

  beforeEach(async () => {
    // Purge database tables in topological order
    await db.delete(candidateEmbeddings);
    await db.delete(jobEmbeddings);
    await db.delete(candidateProfiles);
    await db.delete(candidateEvidence);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    // Delete auditLogs referencing organizations
    const auditLogsTable = (await import('../../src/db')).auditLogs;
    await db.delete(auditLogsTable);
    await db.delete(organizations);
    await db.delete(users);

    // 1. Create Tenant Organizations
    [orgA] = await db.insert(organizations).values({
      name: 'Tenant A Corp',
      slug: 'tenant-a-corp',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Tenant B Corp',
      slug: 'tenant-b-corp',
    }).returning();

    // 2. Create Jobs
    [jobA] = await db.insert(jobs).values({
      organizationId: orgA.id,
      title: 'Backend Engineer',
      description: 'Require Node.js and SQL.',
      requirements: { experienceLevel: 'MID', skills: ['Node.js', 'SQL'] },
      status: 'PUBLISHED',
    }).returning();

    [jobB] = await db.insert(jobs).values({
      organizationId: orgB.id,
      title: 'Frontend Developer',
      description: 'Require React.',
      requirements: { experienceLevel: 'MID', skills: ['React'] },
      status: 'PUBLISHED',
    }).returning();

    // 3. Create Candidates
    [candA1] = await db.insert(candidates).values({
      organizationId: orgA.id,
      status: 'APPROVED',
      firstName: 'Sarah',
      lastName: 'A1',
      email: 'sarah@example.com',
    }).returning();

    [candA2] = await db.insert(candidates).values({
      organizationId: orgA.id,
      status: 'SHORTLISTED',
      firstName: 'Alex',
      lastName: 'A2',
      email: 'alex@example.com',
    }).returning();

    [candB] = await db.insert(candidates).values({
      organizationId: orgB.id,
      status: 'APPROVED',
      firstName: 'John',
      lastName: 'B',
      email: 'john@example.com',
    }).returning();

    // 4. Create Document
    [docA1] = await db.insert(candidateDocuments).values({
      organizationId: orgA.id,
      candidateId: candA1.id,
      fileName: 'sarah_resume.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storageKey: 'sarah-key.pdf',
      rawText: 'Sarah has Node.js and SQL backend dev experience.'
    }).returning();

    // 5. Create Profiles and Evidence
    await db.insert(candidateProfiles).values({
      organizationId: orgA.id,
      candidateId: candA1.id,
      skills: ['Node.js', 'SQL'],
      experience: [{ role: 'Dev', company: 'X', startDate: '2020-01', endDate: '2023-01', description: 'Node' }],
      education: [],
    });

    await db.insert(candidateProfiles).values({
      organizationId: orgA.id,
      candidateId: candA2.id,
      skills: ['Node.js'],
      experience: [{ role: 'Dev', company: 'Y', startDate: '2021-01', endDate: '2023-01', description: 'SQL Node' }],
      education: [],
    });

    await db.insert(candidateProfiles).values({
      organizationId: orgB.id,
      candidateId: candB.id,
      skills: ['React'],
      experience: [],
      education: [],
    });

    await db.insert(candidateEvidence).values({
      organizationId: orgA.id,
      candidateId: candA1.id,
      skill: 'Node.js',
      sourceDocumentId: docA1.id,
      excerpt: 'Built backend in Node.js',
    });
  });

  it('should successfully retrieve all valid candidate comparison data under Org A job context', async () => {
    const candidateIds = [candA1.id, candA2.id];

    // Simulating endpoint query: load candidates belonging to orgA
    const dbCandidates = await db.query.candidates.findMany({
      where: and(
        eq(candidates.organizationId, orgA.id),
        inArray(candidates.id, candidateIds)
      ),
      with: {
        profiles: true,
        evidence: true,
      },
    });

    expect(dbCandidates.length).toBe(2);
    expect(dbCandidates[0].firstName).toBe('Sarah');
    expect(dbCandidates[1].firstName).toBe('Alex');

    // Verify evidence is loaded correctly
    expect(dbCandidates[0].evidence.length).toBe(1);
    expect(dbCandidates[0].evidence[0].skill).toBe('Node.js');
    expect(dbCandidates[0].evidence[0].excerpt).toBe('Built backend in Node.js');
  });

  it('should enforce strict cross-tenant boundary isolation and prevent comparison with Org B candidate', async () => {
    // Org A attempts to compare Org A candidate + Org B candidate
    const inputCandidateIds = [candA1.id, candB.id];

    const dbCandidates = await db.query.candidates.findMany({
      where: and(
        eq(candidates.organizationId, orgA.id), // Enforced organization ID boundary
        inArray(candidates.id, inputCandidateIds)
      ),
    });

    // It must return only the candidate belonging to Org A (Sarah), completely excluding Org B (John)
    expect(dbCandidates.length).toBe(1);
    expect(dbCandidates[0].id).toBe(candA1.id);
    expect(dbCandidates[0].firstName).toBe('Sarah');

    // This proves that dbCandidates.length !== inputCandidateIds.length, which triggers the NOT_FOUND / 404 block in the API route!
    const allFound = dbCandidates.length === inputCandidateIds.length;
    expect(allFound).toBe(false);
  });
});
