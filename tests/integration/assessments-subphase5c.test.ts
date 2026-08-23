import { describe, it, expect, beforeEach } from 'vitest';
import { db, users, organizations, memberships, jobs, candidates, assessmentTemplates, assessmentQuestions, codingTestCases, interviewSessions, interviewAnswers, codeExecutionResults, assessmentEvaluations, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, eq, and } from '../../src/db';
import { evaluateAssessmentSession } from '../../src/lib/assessment/worker';

describe('Phase 5C Integration Tests: Assessment Evaluation Worker & Sandboxed Runner', () => {
  let userRecruiterA: any;
  let organizationA: any;
  let candidateA: any;
  let jobA: any;
  let templateA: any;
  let mcqQuestion: any;
  let codingQuestion: any;

  beforeEach(async () => {
    // Clean database tables in reverse dependency order
    await db.delete(assessmentEvaluations);
    await db.delete(codeExecutionResults);
    await db.delete(interviewAnswers);
    await db.delete(interviewSessions);
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

    // Setup Org A
    [organizationA] = await db.insert(organizations).values({
      name: 'Evaluation Worker Org A',
      slug: 'worker-org-a',
    }).returning();

    // Setup Recruiter A
    [userRecruiterA] = await db.insert(users).values({
      name: 'Recruiter Admin Worker',
      email: 'recruiter.worker@example.com',
      passwordHash: 'hashWorker123',
    }).returning();

    await db.insert(memberships).values({
      userId: userRecruiterA.id,
      organizationId: organizationA.id,
      role: 'RECRUITER',
    });

    // Create Candidate A
    [candidateA] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob.smith@example.com',
      status: 'APPROVED',
    }).returning();

    // Create Job A
    [jobA] = await db.insert(jobs).values({
      organizationId: organizationA.id,
      title: 'Backend Engineer',
      description: 'Python & Node.js Developer',
      status: 'PUBLISHED',
    }).returning();

    // Create Assessment Template
    [templateA] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'Backend Engineer Technical Assessment',
      timeLimitMinutes: 60,
      passingScore: 70,
      status: 'ACTIVE',
    }).returning();

    // 1. Add MCQ question (10 points)
    [mcqQuestion] = await db.insert(assessmentQuestions).values({
      organizationId: organizationA.id,
      templateId: templateA.id,
      type: 'MULTIPLE_CHOICE',
      title: 'Database Indexing',
      prompt: 'Which index type is best for fast equality lookups in PostgreSQL?',
      options: [
        { key: 'A', label: 'B-Tree' },
        { key: 'B', label: 'Hash' },
      ],
      correctOption: 'B',
      points: 10,
      orderIndex: 0,
    }).returning();

    // 2. Add Coding question (20 points: 10 points per test case)
    [codingQuestion] = await db.insert(assessmentQuestions).values({
      organizationId: organizationA.id,
      templateId: templateA.id,
      type: 'CODING_CHALLENGE',
      title: 'Two Sum Algorithm',
      prompt: 'Return indices of two numbers that sum up to target.',
      allowedLanguages: ['python'],
      points: 20,
      orderIndex: 1,
    }).returning();

    await db.insert(codingTestCases).values([
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
    ]);
  });

  it('should evaluate candidate session deterministically with 100% correct answers', async () => {
    // 1. Create interview session
    const accessToken = `session-${crypto.randomUUID()}`;
    const [session] = await db.insert(interviewSessions).values({
      organizationId: organizationA.id,
      candidateId: candidateA.id,
      templateId: templateA.id,
      accessToken,
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 3600000),
    }).returning();

    // 2. Insert candidate correct answers
    await db.insert(interviewAnswers).values([
      {
        organizationId: organizationA.id,
        sessionId: session.id,
        questionId: mcqQuestion.id,
        selectedOption: 'B', // Correct MCQ choice
      },
      {
        organizationId: organizationA.id,
        sessionId: session.id,
        questionId: codingQuestion.id,
        submittedCode: 'def twoSum(nums, target):\n    return [0, 1]',
        programmingLanguage: 'python',
      },
    ]);

    // 3. Trigger evaluation worker
    const evalResult = await evaluateAssessmentSession(session.id);

    expect(evalResult.status).toBe('EVALUATED');
    expect(evalResult.deterministicScore).toBe(30); // 10 MCQ + 20 Coding (10+10)
    expect(evalResult.maxDeterministicScore).toBe(30);

    // Verify session updated status
    const updatedSession = await db.query.interviewSessions.findFirst({
      where: eq(interviewSessions.id, session.id),
    });
    expect(updatedSession?.status).toBe('EVALUATED');

    // Verify evaluation record in DB
    const dbEval = await db.query.assessmentEvaluations.findFirst({
      where: eq(assessmentEvaluations.sessionId, session.id),
    });
    expect(dbEval?.finalScore).toBe(100);
    expect(dbEval?.isOverridden).toBe(false);

    // Verify code execution results recorded
    const executionResults = await db.query.codeExecutionResults.findMany({
      where: eq(codeExecutionResults.organizationId, organizationA.id),
    });
    expect(executionResults.length).toBe(2);
    expect(executionResults.every(r => r.passed)).toBe(true);
  });
});
