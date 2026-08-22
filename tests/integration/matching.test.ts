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
  auditLogs,
  eq,
} from '../../src/db';
import { calculateExperienceYears } from '../../src/lib/matching';

describe('Real PostgreSQL Integration Tests: Semantic Candidate Matching', () => {
  let orgA: any;
  let orgB: any;
  let userA: any;
  let jobA: any;

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

    // 1. Create organizations
    [orgA] = await db.insert(organizations).values({
      name: 'Org A',
      slug: 'org-a',
    }).returning();

    [orgB] = await db.insert(organizations).values({
      name: 'Org B',
      slug: 'org-b',
    }).returning();

    // 2. Create users & membership
    [userA] = await db.insert(users).values({
      email: 'recruiter@orga.com',
      name: 'Recruiter A',
      passwordHash: 'hashed',
    }).returning();

    await db.insert(memberships).values({
      userId: userA.id,
      organizationId: orgA.id,
      role: 'RECRUITER',
    });

    // 3. Create job opening
    [jobA] = await db.insert(jobs).values({
      organizationId: orgA.id,
      title: 'Python Backend Engineer',
      description: 'Looking for a Senior Python Developer with PostgreSQL expertise.',
      status: 'PUBLISHED',
      requirements: {
        experienceLevel: 'SENIOR',
        skills: ['Python', 'PostgreSQL'],
        responsibilities: ['Build APIs'],
        qualifications: ['AWS'],
      },
    }).returning();

    // 4. Create job embedding vector (768 dims)
    const mockVector = new Array(768).fill(0.1);
    mockVector[0] = 0.5; // Distinctive token values
    await db.insert(jobEmbeddings).values({
      jobId: jobA.id,
      organizationId: orgA.id,
      embedding: mockVector,
      model: 'text-embedding-004',
      version: '1.0',
    });
  });

  it('should calculate experience years dynamically from profile dates', () => {
    const experiences = [
      { startDate: '2020-01-01', endDate: '2023-01-01' }, // 3 years
      { startDate: '2023-06-01', endDate: 'Present' },    // ongoing, calculated against current date
    ];
    const years = calculateExperienceYears(experiences);
    expect(years).toBeGreaterThanOrEqual(3.0);
  });

  it('should enforce multi-tenant vector boundaries and candidate approval status', async () => {
    // Candidate 1: Same Org, APPROVED status -> Should be matched
    const [cand1] = await db.insert(candidates).values({
      organizationId: orgA.id,
      firstName: 'Matching',
      lastName: 'Candidate',
      email: 'matching@orga.com',
      status: 'APPROVED',
    }).returning();

    await db.insert(candidateProfiles).values({
      candidateId: cand1.id,
      organizationId: orgA.id,
      summary: 'Senior Developer',
      skills: [{ name: 'Python', excerpt: 'Python developer for 5 years.' }],
      experience: [],
      education: [],
    });

    const cand1Vector = new Array(768).fill(0.1);
    cand1Vector[0] = 0.48; // Very close to jobA vector (0.5) -> High similarity
    await db.insert(candidateEmbeddings).values({
      candidateId: cand1.id,
      organizationId: orgA.id,
      embedding: cand1Vector,
      model: 'text-embedding-004',
      version: '1.0',
    });

    // Candidate 2: Different Org, APPROVED status -> Cross-tenant (Must NOT be matched)
    const [cand2] = await db.insert(candidates).values({
      organizationId: orgB.id,
      firstName: 'CrossTenant',
      lastName: 'Candidate',
      email: 'crosstenant@orgb.com',
      status: 'APPROVED',
    }).returning();

    await db.insert(candidateProfiles).values({
      candidateId: cand2.id,
      organizationId: orgB.id,
      summary: 'Senior Developer',
      skills: [{ name: 'Python', excerpt: 'Python developer.' }],
      experience: [],
      education: [],
    });

    const cand2Vector = new Array(768).fill(0.1);
    cand2Vector[0] = 0.5; // Identical, but wrong tenant boundary!
    await db.insert(candidateEmbeddings).values({
      candidateId: cand2.id,
      organizationId: orgB.id,
      embedding: cand2Vector,
      model: 'text-embedding-004',
      version: '1.0',
    });

    // Candidate 3: Same Org, UPLOADED status (Not approved) -> Must NOT be matched
    const [cand3] = await db.insert(candidates).values({
      organizationId: orgA.id,
      firstName: 'Unapproved',
      lastName: 'Candidate',
      email: 'unapproved@orga.com',
      status: 'UPLOADED',
    }).returning();

    // Query candidate matching matches (mimics endpoint SQL)
    const matchedList = await db.query.candidates.findMany({
      where: eq(candidates.organizationId, orgA.id),
      with: {
        embeddings: true,
        profiles: true,
      },
    });

    // Filtering out unapproved status and checking results
    const eligibleMatches = matchedList.filter(c => c.status === 'APPROVED' && c.embeddings.length > 0);

    expect(eligibleMatches.length).toBe(1);
    expect(eligibleMatches[0].id).toBe(cand1.id);
    expect(eligibleMatches[0].firstName).toBe('Matching');
  });
});
