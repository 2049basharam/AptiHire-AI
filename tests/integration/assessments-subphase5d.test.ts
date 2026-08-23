import { describe, it, expect, beforeEach } from 'vitest';
import { db, users, organizations, memberships, jobs, candidates, assessmentTemplates, assessmentQuestions, interviewSessions, assessmentEvaluations, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, eq, and } from '../../src/db';

describe('Phase 5D Integration Tests: Recruiter Score Override & Audit Logging', () => {
  let userRecruiterA: any;
  let userRecruiterB: any;
  let organizationA: any;
  let organizationB: any;
  let candidateA: any;
  let jobA: any;
  let templateA: any;
  let sessionA: any;
  let evaluationA: any;

  beforeEach(async () => {
    // Clean database tables in reverse dependency order
    await db.delete(assessmentEvaluations);
    await db.delete(interviewSessions);
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

    // Setup Org A and Org B
    [organizationA] = await db.insert(organizations).values({
      name: 'Override Test Org A',
      slug: 'override-org-a',
    }).returning();

    [organizationB] = await db.insert(organizations).values({
      name: 'Override Test Org B',
      slug: 'override-org-b',
    }).returning();

    // Setup Recruiter A and Recruiter B
    [userRecruiterA] = await db.insert(users).values({
      name: 'Recruiter Admin A',
      email: 'recruiter.override.a@example.com',
      passwordHash: 'hashOverrideA',
    }).returning();

    [userRecruiterB] = await db.insert(users).values({
      name: 'Recruiter Admin B',
      email: 'recruiter.override.b@example.com',
      passwordHash: 'hashOverrideB',
    }).returning();

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

    // Create Candidate A
    [candidateA] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Charlie',
      lastName: 'Brown',
      email: 'charlie.brown@example.com',
      status: 'APPROVED',
    }).returning();

    // Create Job A
    [jobA] = await db.insert(jobs).values({
      organizationId: organizationA.id,
      title: 'DevOps Engineer',
      description: 'Kubernetes & CI/CD specialist',
      status: 'PUBLISHED',
    }).returning();

    // Create Assessment Template
    [templateA] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'DevOps Assessment',
      timeLimitMinutes: 45,
      passingScore: 70,
    }).returning();

    // Create Session
    [sessionA] = await db.insert(interviewSessions).values({
      organizationId: organizationA.id,
      candidateId: candidateA.id,
      templateId: templateA.id,
      accessToken: `session-${crypto.randomUUID()}`,
      status: 'EVALUATED',
      expiresAt: new Date(Date.now() + 3600000),
    }).returning();

    // Create Evaluation with initial score 60
    [evaluationA] = await db.insert(assessmentEvaluations).values({
      organizationId: organizationA.id,
      sessionId: sessionA.id,
      deterministicScore: 18,
      maxDeterministicScore: 30,
      finalScore: 60,
      isOverridden: false,
    }).returning();
  });

  it('should allow recruiter to override evaluation score and record an audit log entry', async () => {
    const newScore = 85;
    const overrideReason = 'Candidate demonstrated exceptional practical knowledge during technical interview.';

    // Execute score override transaction
    const [updatedEvaluation] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(assessmentEvaluations)
        .set({
          finalScore: newScore,
          isOverridden: true,
          overriddenByUserId: userRecruiterA.id,
          overrideReason,
          updatedAt: new Date(),
        })
        .where(eq(assessmentEvaluations.id, evaluationA.id))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: organizationA.id,
        userId: userRecruiterA.id,
        action: 'ASSESSMENT_EVALUATION_OVERRIDDEN',
        entityId: evaluationA.id,
        entityType: 'ASSESSMENT_EVALUATION',
        details: {
          sessionId: sessionA.id,
          previousScore: 60,
          newScore: 85,
          overriddenByUserId: userRecruiterA.id,
          overrideReason,
        },
      });

      return [updated];
    });

    expect(updatedEvaluation.finalScore).toBe(85);
    expect(updatedEvaluation.isOverridden).toBe(true);
    expect(updatedEvaluation.overriddenByUserId).toBe(userRecruiterA.id);

    // Verify audit log entry created in DB
    const auditRecord = await db.query.auditLogs.findFirst({
      where: and(eq(auditLogs.entityId, evaluationA.id), eq(auditLogs.action, 'ASSESSMENT_EVALUATION_OVERRIDDEN')),
    });

    expect(auditRecord).toBeDefined();
    expect(auditRecord?.organizationId).toBe(organizationA.id);
    expect((auditRecord?.details as any)?.previousScore).toBe(60);
    expect((auditRecord?.details as any)?.newScore).toBe(85);
  });

  it('should enforce multi-tenant isolation when querying evaluations for override', async () => {
    // Attempting to query evaluation A using Org B ID should return undefined
    const crossTenantAttempt = await db.query.assessmentEvaluations.findFirst({
      where: and(eq(assessmentEvaluations.id, evaluationA.id), eq(assessmentEvaluations.organizationId, organizationB.id)),
    });

    expect(crossTenantAttempt).toBeUndefined();
  });
});
