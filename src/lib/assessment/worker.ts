import { db, interviewSessions, codeExecutionResults, assessmentEvaluations, auditLogs, eq } from '@/db';
import { runSandboxedCode } from './code-runner';
import { logger } from '@/lib/logger';

export interface EvaluationResult {
  sessionId: string;
  deterministicScore: number;
  maxDeterministicScore: number;
  status: string;
}

/**
 * Process assessment evaluation for a submitted candidate interview session.
 * Evaluates MCQ choices, executes coding challenge test cases in sandboxed runner,
 * records detailed code execution outputs, and saves final evaluation metrics.
 */
export async function evaluateAssessmentSession(sessionId: string): Promise<EvaluationResult> {
  const reqId = crypto.randomUUID();
  logger.info(`Starting assessment evaluation for session: ${sessionId}`, reqId);

  // 1. Fetch session with candidate, template, questions, test cases, and candidate answers
  const session = await db.query.interviewSessions.findFirst({
    where: eq(interviewSessions.id, sessionId),
    with: {
      template: {
        with: {
          questions: {
            with: {
              testCases: true,
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!session) {
    throw new Error(`Interview session not found: ${sessionId}`);
  }

  const { organizationId, template, answers } = session;
  const questions = template.questions;

  let totalDeterministicScore = 0;
  let maxDeterministicScore = 0;

  // Map answers by questionId for fast lookup
  const answerMap = new Map(answers.map((ans) => [ans.questionId, ans]));

  // Process each question
  for (const question of questions) {
    const candidateAnswer = answerMap.get(question.id);

    if (question.type === 'MULTIPLE_CHOICE') {
      maxDeterministicScore += question.points;
      if (candidateAnswer && candidateAnswer.selectedOption && candidateAnswer.selectedOption === question.correctOption) {
        totalDeterministicScore += question.points;
      }
    } else if (question.type === 'CODING_CHALLENGE') {
      const testCases = question.testCases;
      for (const tc of testCases) {
        maxDeterministicScore += tc.points;

        if (candidateAnswer && candidateAnswer.submittedCode) {
          const runResult = await runSandboxedCode({
            language: candidateAnswer.programmingLanguage || 'python',
            code: candidateAnswer.submittedCode,
            input: tc.input,
            timeoutMs: tc.timeoutMs,
            memoryLimitMb: tc.memoryLimitMb,
          });

          // Check if actual output matches expected output
          const isMatch = runResult.passed && runResult.actualOutput.trim() === tc.expectedOutput.trim();
          const finalPassed = isMatch;
          const finalStatus = isMatch ? 'PASSED' : (runResult.status === 'PASSED' ? 'FAILED' : runResult.status);

          if (finalPassed) {
            totalDeterministicScore += tc.points;
          }

          // Save code execution result
          await db.insert(codeExecutionResults).values({
            organizationId,
            answerId: candidateAnswer.id,
            testCaseId: tc.id,
            passed: finalPassed,
            actualOutput: runResult.actualOutput,
            errorOutput: runResult.errorOutput || null,
            executionTimeMs: runResult.executionTimeMs,
            memoryUsedMb: runResult.memoryUsedMb,
            status: finalStatus,
          });
        }
      }
    } else if (question.type === 'FREE_TEXT') {
      // Free text questions are qualitative; max points added to evaluation scale but objective score is 0 until LLM / recruiter review
      maxDeterministicScore += question.points;
    }
  }

  // 2. Save or update evaluation record
  const existingEvaluation = await db.query.assessmentEvaluations.findFirst({
    where: eq(assessmentEvaluations.sessionId, sessionId),
  });

  const finalScore = maxDeterministicScore > 0 
    ? Math.round((totalDeterministicScore / maxDeterministicScore) * 100) 
    : 0;

  if (existingEvaluation) {
    await db.update(assessmentEvaluations)
      .set({
        deterministicScore: totalDeterministicScore,
        maxDeterministicScore,
        finalScore,
        updatedAt: new Date(),
      })
      .where(eq(assessmentEvaluations.id, existingEvaluation.id));
  } else {
    await db.insert(assessmentEvaluations).values({
      organizationId,
      sessionId,
      deterministicScore: totalDeterministicScore,
      maxDeterministicScore,
      finalScore,
      isOverridden: false,
    });
  }

  // 3. Update session status to EVALUATED
  await db.update(interviewSessions)
    .set({
      status: 'EVALUATED',
      updatedAt: new Date(),
    })
    .where(eq(interviewSessions.id, sessionId));

  await db.insert(auditLogs).values({
    organizationId,
    action: 'INTERVIEW_SESSION_EVALUATED',
    entityId: sessionId,
    entityType: 'INTERVIEW_SESSION',
    details: { deterministicScore: totalDeterministicScore, maxDeterministicScore, finalScore },
  });

  logger.info(`Assessment evaluation completed for session: ${sessionId}. Score: ${finalScore}%`, reqId);

  return {
    sessionId,
    deterministicScore: totalDeterministicScore,
    maxDeterministicScore,
    status: 'EVALUATED',
  };
}
