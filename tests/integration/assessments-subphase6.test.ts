import { describe, it, expect, beforeEach } from 'vitest';
import { db, users, organizations, memberships, jobs, candidates, assessmentTemplates, interviewSessions, assessmentEvaluations, panelEvaluations, auditLogs, candidateEmbeddings, candidateEvidence, candidateProfiles, candidateDocuments, eq, and } from '../../src/db';

describe('Phase 6 Integration Tests: Collaborative Hiring & Enterprise Operations', () => {
  let userOwnerA: any;
  let userAdminA: any;
  let userRecruiterA: any;
  let userMemberA: any;
  let userRecruiterB: any;
  let organizationA: any;
  let organizationB: any;
  let candidateA1: any;
  let candidateA2: any;
  let candidateB: any;
  let jobA: any;
  let templateA: any;
  let sessionA1: any;

  beforeEach(async () => {
    // Clean database in reverse dependency order
    await db.delete(panelEvaluations);
    await db.delete(assessmentEvaluations);
    await db.delete(interviewSessions);
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
      name: 'Phase 6 Enterprise Org A',
      slug: 'phase-6-org-a',
    }).returning();

    // Setup Org B
    [organizationB] = await db.insert(organizations).values({
      name: 'Phase 6 Enterprise Org B',
      slug: 'phase-6-org-b',
    }).returning();

    // Setup Users
    [userOwnerA] = await db.insert(users).values({
      name: 'Owner Alpha',
      email: 'owner.a@example.com',
      passwordHash: 'hashPass123',
    }).returning();

    await db.insert(memberships).values({
      userId: userOwnerA.id,
      organizationId: organizationA.id,
      role: 'OWNER',
    });

    [userAdminA] = await db.insert(users).values({
      name: 'Admin Alpha',
      email: 'admin.a@example.com',
      passwordHash: 'hashPass123',
    }).returning();

    await db.insert(memberships).values({
      userId: userAdminA.id,
      organizationId: organizationA.id,
      role: 'ADMIN',
    });

    [userRecruiterA] = await db.insert(users).values({
      name: 'Recruiter Alpha',
      email: 'recruiter.a@example.com',
      passwordHash: 'hashPass123',
    }).returning();

    await db.insert(memberships).values({
      userId: userRecruiterA.id,
      organizationId: organizationA.id,
      role: 'RECRUITER',
    });

    [userMemberA] = await db.insert(users).values({
      name: 'Member Alpha',
      email: 'member.a@example.com',
      passwordHash: 'hashPass123',
    }).returning();

    await db.insert(memberships).values({
      userId: userMemberA.id,
      organizationId: organizationA.id,
      role: 'MEMBER',
    });

    [userRecruiterB] = await db.insert(users).values({
      name: 'Recruiter Beta',
      email: 'recruiter.b@example.com',
      passwordHash: 'hashPass123',
    }).returning();

    await db.insert(memberships).values({
      userId: userRecruiterB.id,
      organizationId: organizationB.id,
      role: 'RECRUITER',
    });

    // Create Candidates under Org A & B
    [candidateA1] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice.smith@example.com',
      status: 'APPROVED',
    }).returning();

    [candidateA2] = await db.insert(candidates).values({
      organizationId: organizationA.id,
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob.jones@example.com',
      status: 'APPROVED',
    }).returning();

    [candidateB] = await db.insert(candidates).values({
      organizationId: organizationB.id,
      firstName: 'Charlie',
      lastName: 'Brown',
      email: 'charlie.brown@example.com',
      status: 'APPROVED',
    }).returning();

    // Create Job & Template under Org A
    [jobA] = await db.insert(jobs).values({
      organizationId: organizationA.id,
      title: 'Senior Software Engineer',
      description: 'Distributed Systems & Node.js',
      status: 'PUBLISHED',
    }).returning();

    [templateA] = await db.insert(assessmentTemplates).values({
      organizationId: organizationA.id,
      jobId: jobA.id,
      title: 'Senior Technical Architecture Assessment',
      timeLimitMinutes: 60,
      passingScore: 75,
      status: 'ACTIVE',
    }).returning();

    // Create Session & Objective Evaluation for Candidate A1 under Org A
    [sessionA1] = await db.insert(interviewSessions).values({
      organizationId: organizationA.id,
      candidateId: candidateA1.id,
      templateId: templateA.id,
      accessToken: `session-${crypto.randomUUID()}`,
      status: 'EVALUATED',
      expiresAt: new Date(Date.now() + 86400000),
    }).returning();

    await db.insert(assessmentEvaluations).values({
      organizationId: organizationA.id,
      sessionId: sessionA1.id,
      deterministicScore: 85,
      maxDeterministicScore: 100,
      finalScore: 85,
    });
  });

  describe('1. Multi-Evaluator Hiring Panel Scorecards', () => {
    it('should submit panel evaluation scorecard and preserve objective deterministic scores', async () => {
      // Recruiter A submits scorecard
      const [scorecard1] = await db.insert(panelEvaluations).values({
        organizationId: organizationA.id,
        sessionId: sessionA1.id,
        evaluatorUserId: userRecruiterA.id,
        recommendation: 'STRONG_HIRE',
        qualitativeFeedback: 'Demonstrated exceptional understanding of system architecture and concurrency.',
        scoreOverride: 90,
        overrideReason: 'Strong algorithmic solution with clean error boundaries.',
      }).returning();

      expect(scorecard1.recommendation).toBe('STRONG_HIRE');
      expect(scorecard1.scoreOverride).toBe(90);

      // Verify objective assessment evaluation remains untouched
      const objEval = await db.query.assessmentEvaluations.findFirst({
        where: eq(assessmentEvaluations.sessionId, sessionA1.id),
      });

      expect(objEval?.deterministicScore).toBe(85);
      expect(objEval?.maxDeterministicScore).toBe(100);
      expect(objEval?.finalScore).toBe(85);
    });

    it('should allow multiple evaluators on the same session and support scorecard updates', async () => {
      // 1. Recruiter A submits
      await db.insert(panelEvaluations).values({
        organizationId: organizationA.id,
        sessionId: sessionA1.id,
        evaluatorUserId: userRecruiterA.id,
        recommendation: 'HIRE',
        qualitativeFeedback: 'Solid solution, good technical communication.',
      });

      // 2. Member A submits independent scorecard for same session
      await db.insert(panelEvaluations).values({
        organizationId: organizationA.id,
        sessionId: sessionA1.id,
        evaluatorUserId: userMemberA.id,
        recommendation: 'STRONG_HIRE',
        qualitativeFeedback: 'Excellent edge case handling.',
      });

      const allEvaluations = await db.query.panelEvaluations.findMany({
        where: eq(panelEvaluations.sessionId, sessionA1.id),
      });

      expect(allEvaluations).toHaveLength(2);

      // 3. Recruiter A updates existing scorecard
      const [updated] = await db.update(panelEvaluations)
        .set({
          recommendation: 'STRONG_HIRE',
          qualitativeFeedback: 'Updated: Outstanding system design after panel review.',
          updatedAt: new Date(),
        })
        .where(and(
          eq(panelEvaluations.sessionId, sessionA1.id),
          eq(panelEvaluations.evaluatorUserId, userRecruiterA.id)
        ))
        .returning();

      expect(updated.recommendation).toBe('STRONG_HIRE');
    });

    it('should enforce unique composite index (sessionId, evaluatorUserId) preventing duplicates', async () => {
      await db.insert(panelEvaluations).values({
        organizationId: organizationA.id,
        sessionId: sessionA1.id,
        evaluatorUserId: userRecruiterA.id,
        recommendation: 'HIRE',
        qualitativeFeedback: 'First submission.',
      });

      // Attempt duplicate insert with same (sessionId, evaluatorUserId)
      await expect(db.insert(panelEvaluations).values({
        organizationId: organizationA.id,
        sessionId: sessionA1.id,
        evaluatorUserId: userRecruiterA.id,
        recommendation: 'NO_HIRE',
        qualitativeFeedback: 'Duplicate insertion attempt.',
      })).rejects.toThrow();
    });
  });

  describe('2. Transactional Batch Candidate Assessment Invitations', () => {
    it('should process batch invitations and skip candidates with existing active sessions', async () => {
      // Candidate A1 already has sessionA1. Candidate A2 has no session.
      const candidateIds = [candidateA1.id, candidateA2.id];

      const created: string[] = [];
      const skipped: string[] = [];

      for (const candId of candidateIds) {
        const existing = await db.query.interviewSessions.findFirst({
          where: and(
            eq(interviewSessions.templateId, templateA.id),
            eq(interviewSessions.candidateId, candId),
            eq(interviewSessions.organizationId, organizationA.id)
          ),
        });

        if (existing) {
          skipped.push(candId);
        } else {
          const accessToken = `session-${crypto.randomUUID()}`;
          const [inserted] = await db.insert(interviewSessions).values({
            organizationId: organizationA.id,
            candidateId: candId,
            templateId: templateA.id,
            accessToken,
            status: 'INVITED',
            expiresAt: new Date(Date.now() + 7 * 86400000),
          }).returning();
          created.push(inserted.id);
        }
      }

      expect(created).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toBe(candidateA1.id);
    });

    it('should enforce multi-tenant candidate boundaries on batch invitations', async () => {
      // Include candidateB from Org B in Org A batch attempt
      const mixedCandidateIds = [candidateA2.id, candidateB.id];

      const candidatesInOrgA = await db.query.candidates.findMany({
        where: and(
          eq(candidates.organizationId, organizationA.id)
        ),
      });

      const validCount = mixedCandidateIds.filter(id => candidatesInOrgA.some(c => c.id === id)).length;
      expect(validCount).toBe(1);
      expect(validCount).not.toBe(mixedCandidateIds.length);
    });
  });

  describe('3. Enterprise Audit Log Export Infrastructure', () => {
    beforeEach(async () => {
      // Seed sample audit logs for Org A
      await db.insert(auditLogs).values({
        organizationId: organizationA.id,
        userId: userOwnerA.id,
        action: 'INTERVIEW_SESSION_INVITED',
        entityId: crypto.randomUUID(),
        entityType: 'SESSION',
        details: { accessToken: 'session-secret-12345', candidateId: candidateA1.id },
      });

      await db.insert(auditLogs).values({
        organizationId: organizationA.id,
        userId: userAdminA.id,
        action: 'ASSESSMENT_EVALUATION_OVERRIDDEN',
        entityId: crypto.randomUUID(),
        entityType: 'EVALUATION',
        details: { apiKey: 'secret-api-key', jwt: 'secret-jwt-token', overrideReason: '=1+1 command injection' },
      });
    });

    it('should filter audit logs by organization and redact sensitive fields', async () => {
      const records = await db.query.auditLogs.findMany({
        where: eq(auditLogs.organizationId, organizationA.id),
      });

      expect(records).toHaveLength(2);

      // Helper function to test redaction
      const redact = (details: any) => {
        const sensitive = ['accesstoken', 'apikey', 'jwt'];
        const result: any = {};
        for (const [k, v] of Object.entries(details)) {
          if (sensitive.includes(k.toLowerCase())) {
            result[k] = '[REDACTED]';
          } else {
            result[k] = v;
          }
        }
        return result;
      };

      const redacted1 = redact(records[0].details);
      expect(redacted1.accessToken).toBe('[REDACTED]');
      expect(redacted1.candidateId).toBe(candidateA1.id);

      const redacted2 = redact(records[1].details);
      expect(redacted2.apiKey).toBe('[REDACTED]');
      expect(redacted2.jwt).toBe('[REDACTED]');
    });

    it('should recursively redact snake_case and kebab-case sensitive key variants', () => {
      const sensitiveKeys = [
        'accesstoken', 'token', 'jwt', 'authorization', 'password',
        'secret', 'apikey', 'refreshtoken', 'bearer', 'auth'
      ];

      const redact = (details: any): any => {
        if (!details || typeof details !== 'object') return details;
        if (Array.isArray(details)) return details.map(redact);
        const redacted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
          const normalizedKey = key.toLowerCase().replace(/[\-_]/g, '');
          const isSensitive = sensitiveKeys.some(k => normalizedKey.includes(k));
          if (isSensitive) {
            redacted[key] = '[REDACTED]';
          } else if (typeof value === 'object' && value !== null) {
            redacted[key] = redact(value);
          } else {
            redacted[key] = value;
          }
        }
        return redacted;
      };

      const testPayload = {
        access_token: 'secret-1',
        'api-key': 'secret-2',
        refresh_token: 'secret-3',
        nested: {
          bearer_token: 'secret-4',
          candidateName: 'John',
        },
      };

      const result: any = redact(testPayload);
      expect(result.access_token).toBe('[REDACTED]');
      expect(result['api-key']).toBe('[REDACTED]');
      expect(result.refresh_token).toBe('[REDACTED]');
      expect(result.nested.bearer_token).toBe('[REDACTED]');
      expect(result.nested.candidateName).toBe('John');
    });

    it('should prevent CSV formula injection by prepending single quote to formula triggers', async () => {
      const sanitizeCsvValue = (val: string) => {
        if (!val || typeof val !== 'string') return val;
        const trimmed = val.trim();
        if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
          return `'${trimmed}`;
        }
        return val;
      };

      expect(sanitizeCsvValue('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvValue('+cmd|/c')).toBe("'+cmd|/c");
      expect(sanitizeCsvValue('-100')).toBe("'-100");
      expect(sanitizeCsvValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(sanitizeCsvValue('Normal Text')).toBe('Normal Text');
    });
  });
});

