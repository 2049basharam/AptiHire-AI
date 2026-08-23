import { describe, it, expect } from 'vitest';
import { generateAIQualitativeFeedback } from '../../src/lib/assessment/ai-evaluator';
import { overrideEvaluationSchema } from '../../src/lib/validations/assessment';

describe('Sub-phase 5D Unit Tests: AI Qualitative Feedback & Score Override Validation', () => {
  it('should generate qualitative feedback structure without altering numerical scores', async () => {
    const feedback = await generateAIQualitativeFeedback({
      templateTitle: 'Senior React Developer Assessment',
      candidateName: 'John Doe',
      answers: [
        {
          questionTitle: 'Two Sum',
          questionPrompt: 'Find indices of two numbers that add up to target',
          questionType: 'CODING_CHALLENGE',
          submittedCode: 'def twoSum(nums, target):\n    return [0, 1]',
          programmingLanguage: 'python',
          testResults: [{ passed: true, status: 'PASSED' }, { passed: true, status: 'PASSED' }],
        },
      ],
    });

    expect(feedback).toBeDefined();
    expect(feedback.summary).toBeDefined();
    expect(Array.isArray(feedback.strengths)).toBe(true);
    expect(Array.isArray(feedback.areasForImprovement)).toBe(true);
    expect(['EXCELLENT', 'GOOD', 'NEEDS_IMPROVEMENT', 'POOR']).toContain(feedback.codeQualityRating);
  });

  it('should validate score override payloads strictly via Zod schema', () => {
    // Valid payload
    const validResult = overrideEvaluationSchema.safeParse({
      newScore: 85,
      overrideReason: 'Candidate demonstrated deep understanding during technical discussion.',
    });
    expect(validResult.success).toBe(true);

    // Invalid score (> 100)
    const invalidScoreResult = overrideEvaluationSchema.safeParse({
      newScore: 120,
      overrideReason: 'Invalid score value beyond bounds',
    });
    expect(invalidScoreResult.success).toBe(false);

    // Invalid short reason (< 5 chars)
    const shortReasonResult = overrideEvaluationSchema.safeParse({
      newScore: 90,
      overrideReason: 'Ok',
    });
    expect(shortReasonResult.success).toBe(false);
  });
});
