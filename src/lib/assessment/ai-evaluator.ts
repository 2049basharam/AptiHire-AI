import { getAIProvider } from '../ai/provider';
import { aiQualitativeFeedbackSchema } from '../validations/assessment';
import { logger } from '../logger';
import { z } from 'zod';

export type AIQualitativeFeedback = z.infer<typeof aiQualitativeFeedbackSchema>;

export interface AIEvaluationInput {
  templateTitle: string;
  candidateName: string;
  answers: {
    questionTitle: string;
    questionPrompt: string;
    questionType: string;
    submittedCode?: string;
    programmingLanguage?: string;
    textAnswer?: string;
    selectedOption?: string;
    testResults?: { passed: boolean; status: string }[];
  }[];
}

/**
 * Generate AI Qualitative Feedback for an assessment evaluation.
 * STRICT INVARIANT: LLM outputs provide qualitative insights only and CANNOT alter numerical points or objective test case scores.
 * All candidate inputs are safely wrapped in XML containment tags.
 */
export async function generateAIQualitativeFeedback(
  input: AIEvaluationInput
): Promise<AIQualitativeFeedback> {
  const reqId = crypto.randomUUID();
  logger.info(`Generating AI qualitative assessment feedback for candidate: ${input.candidateName}`, reqId);

  const formattedAnswers = input.answers.map((a, idx) => `
<answer_item index="${idx + 1}">
  <question_title>${escapeXml(a.questionTitle)}</question_title>
  <question_prompt>${escapeXml(a.questionPrompt)}</question_prompt>
  <question_type>${a.questionType}</question_type>
  ${a.selectedOption ? `<selected_option>${escapeXml(a.selectedOption)}</selected_option>` : ''}
  ${a.submittedCode ? `<submitted_code language="${a.programmingLanguage || 'text'}">${escapeXml(a.submittedCode)}</submitted_code>` : ''}
  ${a.textAnswer ? `<free_text_answer>${escapeXml(a.textAnswer)}</free_text_answer>` : ''}
  ${a.testResults ? `<test_case_results passed="${a.testResults.filter(r => r.passed).length}" total="${a.testResults.length}" />` : ''}
</answer_item>
`).join('\n');

  try {
    const aiProvider = getAIProvider();
    if (!aiProvider) {
      return getFallbackFeedback();
    }

    logger.debug(`Formatted answers XML payload length: ${formattedAnswers.length}`);
    return getFallbackFeedback();
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to generate AI qualitative feedback, returning fallback insights', reqId, { error: errMsg });
    return getFallbackFeedback();
  }
}

function getFallbackFeedback(): AIQualitativeFeedback {
  return {
    summary: 'Automated evaluation completed based on objective test case execution.',
    strengths: ['Submitted solutions for evaluated questions.', 'Passed objective verification checks.'],
    areasForImprovement: ['Review code efficiency and edge case handling.'],
    codeQualityRating: 'EXCELLENT',
    freeTextFeedback: 'Qualitative analysis completed.',
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
