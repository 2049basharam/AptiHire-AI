import { describe, it, expect, beforeEach } from 'vitest';
import { db, users, organizations, memberships, jobs, assessmentTemplates, assessmentQuestions, codingTestCases, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, candidates, eq, and } from '../../src/db';

describe('Phase 5A Integration Tests: Assessment Templates & Questions Schema & Security', () => {
  let userRecruiterA: any;
  let userRecruiterB: any;
  let organizationA: any;
  let organizationB: any;
  let jobA: any;
  let jobB: any;

  beforeEach(async () => {
    // Clean database tables in reverse dependency order
    await db.delete(codingTestCases);
    await db.delete(assessmentQuestions);
    await db.delete(assessmentTemplates);
    await db.delete(auditLogs);
    await db.delete(candidateEmbeddings);
    await db.delete(candidateEvidence);
    await db.delete(candidateProfiles);
    await db.delete(candidateDocuments);
    await db.delete(candidates);
    await db.delete(jobs);
    await db.delete(memberships);
    await db.delete(organizations);
    await db.delete(users);

    // Create Recruiter A and Recruiter B
    [userRecruiterA] = await db.insert(users).values({
      name: 'Recruiter A',
      email: 'recruiter.a@example.com',
      passwordHash: 'hashA123',
    }).returning();

    [userRecruiterB] = await db.insert(users).values({
      name: 'Recruiter B',
      email: 'recruiter.b@example.com',
      passwordHash: 'hashB123',
    }).returning();

    // Create Org A and Org B
    [organizationA] = await db.insert(organizations).values({
      name: 'Assessment Org A',
      slug: 'assessment-org-a',
    }).returning();

    [organizationB] = await db.insert(organizations).values({
      name: 'Assessment Org B',
      slug: 'assessment-org-b',
    }).returning();

    // Memberships
    await db.insert(memberships).values({
      userId: userRecruiterA.id,
      organizationId: organizationA.id,
      role: 'RECRUITER',
    });

    await db.insert(memberships).values({
      userId: userRecruiterB.id,
      organizationId: organizationB.id,
      role: 'RECRUITER',
    });

    // Create Job A in Org A, Job B in Org B
    [jobA] = await db.insert(jobs).values({
      organizationId: organizationA.id,
      title: 'Senior Software Engineer',
      description: 'Build backend APIs with Next.js and PostgreSQL',
      status: 'PUBLISHED',
    }).returning();

    [jobB] = await db.insert(jobs).values({
      organizationId: organizationB.id,
      title: 'Frontend Developer',
      description: 'Build React components',
      status: 'PUBLISHED',
    }).returning();
  });

  it('should successfully create an assessment template and questions under Org A', async () => {
    const [template] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'Senior Software Engineer Technical Assessment',
      description: 'Evaluate Node.js, SQL, and Algorithmic Coding skills',
      timeLimitMinutes: 60,
      passingScore: 75,
      status: 'ACTIVE',
    }).returning();

    expect(template).toBeDefined();
    expect(template.organizationId).toBe(organizationA.id);
    expect(template.jobId).toBe(jobA.id);

    // Add MCQ Question
    const [mcqQuestion] = await db.insert(assessmentQuestions).values({
      organizationId: organizationA.id,
      templateId: template.id,
      type: 'MULTIPLE_CHOICE',
      title: 'SQL Indexing Knowledge',
      prompt: 'Which index type is optimal for exact equality lookups in PostgreSQL?',
      options: [
        { key: 'A', label: 'B-Tree' },
        { key: 'B', label: 'Hash' },
        { key: 'C', label: 'BRIN' },
      ],
      correctOption: 'B',
      points: 10,
      orderIndex: 0,
    }).returning();

    expect(mcqQuestion.templateId).toBe(template.id);

    // Add Coding Question with test cases
    const [codingQuestion] = await db.insert(assessmentQuestions).values({
      organizationId: organizationA.id,
      templateId: template.id,
      type: 'CODING_CHALLENGE',
      title: 'Two Sum Algorithm',
      prompt: 'Given an array of numbers and a target integer, return indices of two numbers that add up to target.',
      allowedLanguages: ['python', 'javascript'],
      points: 20,
      orderIndex: 1,
    }).returning();

    const [testCase1, testCase2] = await db.insert(codingTestCases).values([
      {
        organizationId: organizationA.id,
        questionId: codingQuestion.id,
        input: 'nums = [2,7,11,15], target = 9',
        expectedOutput: '[0,1]',
        isHidden: false,
        points: 10,
        timeoutMs: 3000,
        memoryLimitMb: 128,
      },
      {
        organizationId: organizationA.id,
        questionId: codingQuestion.id,
        input: 'nums = [3,2,4], target = 6',
        expectedOutput: '[1,2]',
        isHidden: true,
        points: 10,
        timeoutMs: 3000,
        memoryLimitMb: 128,
      },
    ]).returning();

    expect(testCase1.questionId).toBe(codingQuestion.id);
    expect(testCase2.isHidden).toBe(true);

    // Query template with questions and test cases
    const fullTemplate = await db.query.assessmentTemplates.findFirst({
      where: and(eq(assessmentTemplates.id, template.id), eq(assessmentTemplates.organizationId, organizationA.id)),
      with: {
        questions: {
          with: {
            testCases: true,
          },
        },
      },
    });

    expect(fullTemplate?.questions.length).toBe(2);
    const codingQ = fullTemplate?.questions.find(q => q.type === 'CODING_CHALLENGE');
    expect(codingQ?.testCases.length).toBe(2);
  });

  it('should enforce strict cross-tenant isolation when querying templates', async () => {
    // Insert template in Org A
    const [templateA] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'Org A Confidential Assessment',
      timeLimitMinutes: 45,
      passingScore: 70,
    }).returning();

    // Querying template A using Org B ID should return undefined
    const orgBAccessAttempt = await db.query.assessmentTemplates.findFirst({
      where: and(eq(assessmentTemplates.id, templateA.id), eq(assessmentTemplates.organizationId, organizationB.id)),
    });

    expect(orgBAccessAttempt).toBeUndefined();
  });
});
