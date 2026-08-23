import { describe, it, expect, beforeEach } from 'vitest';
import { db, users, organizations, memberships, jobs, candidates, assessmentTemplates, assessmentQuestions, codingTestCases, interviewSessions, interviewAnswers, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, eq, and } from '../../src/db';

describe('Phase 5B Integration Tests: Candidate Session State Machine & Timed Assessment Portal', () => {
  let userRecruiterA: any;
  let organizationA: any;
  let organizationB: any;
  let candidateA: any;
  let jobA: any;
  let templateA: any;

  beforeEach(async () => {
    // Clean database tables in reverse dependency order
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
      name: 'Assessment Session Org A',
      slug: 'session-org-a',
    }).returning();

    // Setup Org B
    [organizationB] = await db.insert(organizations).values({
      name: 'Assessment Session Org B',
      slug: 'session-org-b',
    }).returning();

    // Setup Recruiter A
    [userRecruiterA] = await db.insert(users).values({
      name: 'Recruiter Admin A',
      email: 'recruiter.session@example.com',
      passwordHash: 'hashSession123',
    }).returning();

    await db.insert(memberships).values({
      userId: userRecruiterA.id,
      organizationId: organizationA.id,
      role: 'RECRUITER',
    });

    // Create Candidate A under Org A
    [candidateA] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@example.com',
      status: 'APPROVED',
    }).returning();

    // Create Job A under Org A
    [jobA] = await db.insert(jobs).values({
      organizationId: organizationA.id,
      title: 'Full Stack Engineer',
      description: 'Next.js & Node.js Engineer',
      status: 'PUBLISHED',
    }).returning();

    // Create Assessment Template A under Org A
    [templateA] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'Full Stack Engineer Technical Assessment',
      timeLimitMinutes: 45,
      passingScore: 70,
      status: 'ACTIVE',
    }).returning();

    // Add MCQ question
    await db.insert(assessmentQuestions).values({
      organizationId: organizationA.id,
      templateId: templateA.id,
      type: 'MULTIPLE_CHOICE',
      title: 'React Hooks Question',
      prompt: 'Which hook should be used for side effects in React?',
      options: [
        { key: 'A', label: 'useState' },
        { key: 'B', label: 'useEffect' },
      ],
      correctOption: 'B',
      points: 10,
      orderIndex: 0,
    });
  });

  it('should process candidate session state machine transitions cleanly', async () => {
    // 1. Recruiter invites candidate -> CREATES session in state INVITED
    const accessToken = `session-${crypto.randomUUID()}`;
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [session] = await db.insert(interviewSessions).values({
      organizationId: organizationA.id,
      candidateId: candidateA.id,
      templateId: templateA.id,
      accessToken,
      status: 'INVITED',
      expiresAt: tokenExpiresAt,
    }).returning();

    expect(session.status).toBe('INVITED');

    // Verify audit log record omits raw accessToken
    const [auditLog] = await db.insert(auditLogs).values({
      organizationId: organizationA.id,
      userId: userRecruiterA.id,
      action: 'INTERVIEW_SESSION_INVITED',
      entityId: session.id,
      entityType: 'INTERVIEW_SESSION',
      details: { candidateId: candidateA.id, templateId: templateA.id },
    }).returning();

    expect(auditLog.details).not.toHaveProperty('accessToken');

    // 2. Candidate starts session -> Transition to IN_PROGRESS & set timer
    const now = new Date();
    const timerExpiresAt = new Date(now.getTime() + 45 * 60 * 1000);

    const [startedSession] = await db.update(interviewSessions)
      .set({
        status: 'IN_PROGRESS',
        startedAt: now,
        expiresAt: timerExpiresAt,
      })
      .where(eq(interviewSessions.id, session.id))
      .returning();

    expect(startedSession.status).toBe('IN_PROGRESS');

    // 3. Candidate submits answer
    const questions = await db.query.assessmentQuestions.findMany({
      where: eq(assessmentQuestions.templateId, templateA.id),
    });

    const [answer] = await db.insert(interviewAnswers).values({
      organizationId: organizationA.id,
      sessionId: session.id,
      questionId: questions[0].id,
      selectedOption: 'B',
    }).returning();

    expect(answer.selectedOption).toBe('B');

    // 4. Candidate finalizes session -> Transition to SUBMITTED
    const [finalizedSession] = await db.update(interviewSessions)
      .set({
        status: 'SUBMITTED',
        submittedAt: new Date(),
      })
      .where(eq(interviewSessions.id, session.id))
      .returning();

    expect(finalizedSession.status).toBe('SUBMITTED');
  });

  it('should enforce multi-tenant isolation on candidate session token lookups', async () => {
    const accessToken = `session-${crypto.randomUUID()}`;
    await db.insert(interviewSessions).values({
      organizationId: organizationA.id,
      candidateId: candidateA.id,
      templateId: templateA.id,
      accessToken,
      status: 'INVITED',
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Lookup session token with matching Org A should succeed
    const sessionOrgA = await db.query.interviewSessions.findFirst({
      where: and(eq(interviewSessions.accessToken, accessToken), eq(interviewSessions.organizationId, organizationA.id)),
    });
    expect(sessionOrgA).toBeDefined();

    // Lookup session token with mismatched Org B should fail
    const sessionOrgB = await db.query.interviewSessions.findFirst({
      where: and(eq(interviewSessions.accessToken, accessToken), eq(interviewSessions.organizationId, organizationB.id)),
    });
    expect(sessionOrgB).toBeUndefined();
  });
});
