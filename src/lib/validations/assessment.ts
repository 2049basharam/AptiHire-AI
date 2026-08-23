import { z } from 'zod';

export const createAssessmentTemplateSchema = z.object({
  jobId: z.string().uuid({ message: 'Valid jobId UUID is required' }),
  title: z.string().min(3, { message: 'Title must be at least 3 characters long' }).max(255),
  description: z.string().optional(),
  timeLimitMinutes: z.number().int().min(5).max(180).default(60),
  passingScore: z.number().int().min(0).max(100).default(70),
});

export const updateAssessmentTemplateSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  timeLimitMinutes: z.number().int().min(5).max(180).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export const codingTestCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  isHidden: z.boolean().default(true),
  points: z.number().int().min(1).default(5),
  timeoutMs: z.number().int().min(500).max(10000).default(3000),
  memoryLimitMb: z.number().int().min(16).max(512).default(128),
});

export const createQuestionSchema = z.object({
  type: z.enum(['MULTIPLE_CHOICE', 'FREE_TEXT', 'CODING_CHALLENGE']),
  title: z.string().min(3).max(255),
  prompt: z.string().min(5),
  options: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
  })).optional(),
  correctOption: z.string().optional(),
  allowedLanguages: z.array(z.string()).optional(),
  points: z.number().int().min(1).default(10),
  orderIndex: z.number().int().min(0).default(0),
  testCases: z.array(codingTestCaseSchema).optional(),
});

export const inviteCandidateSchema = z.object({
  templateId: z.string().uuid({ message: 'Valid templateId UUID is required' }),
  candidateId: z.string().uuid({ message: 'Valid candidateId UUID is required' }),
});

export const submitAnswerSchema = z.object({
  token: z.string().min(10, { message: 'Valid access token is required' }),
  questionId: z.string().uuid({ message: 'Valid questionId UUID is required' }),
  selectedOption: z.string().optional(),
  textAnswer: z.string().optional(),
  submittedCode: z.string().optional(),
  programmingLanguage: z.string().optional(),
});

export const aiQualitativeFeedbackSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  areasForImprovement: z.array(z.string()),
  codeQualityRating: z.enum(['EXCELLENT', 'GOOD', 'NEEDS_IMPROVEMENT', 'POOR']),
  freeTextFeedback: z.string().optional(),
});

export const overrideEvaluationSchema = z.object({
  newScore: z.number().int().min(0).max(100),
  overrideReason: z.string().min(5, { message: 'Justification must be at least 5 characters long' }),
});

export const panelEvaluationSchema = z.object({
  sessionId: z.string().uuid({ message: 'Valid sessionId UUID is required' }),
  recommendation: z.enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE'], {
    errorMap: () => ({ message: 'Recommendation must be STRONG_HIRE, HIRE, NO_HIRE, or STRONG_NO_HIRE' }),
  }),
  qualitativeFeedback: z.string().min(10, { message: 'Qualitative feedback must be at least 10 characters long' }).max(2000),
  scoreOverride: z.number().int().min(0).max(100).optional(),
  overrideReason: z.string().min(5, { message: 'Override justification must be at least 5 characters long' }).optional(),
}).refine((data) => {
  if (data.scoreOverride !== undefined && data.scoreOverride !== null) {
    return data.overrideReason !== undefined && data.overrideReason !== null && data.overrideReason.trim().length >= 5;
  }
  return true;
}, {
  message: 'Override justification (at least 5 characters) is required when providing a score override',
  path: ['overrideReason'],
});

export const batchInviteSchema = z.object({
  templateId: z.string().uuid({ message: 'Valid templateId UUID is required' }),
  candidateIds: z.array(z.string().uuid({ message: 'Each candidate ID must be a valid UUID' }))
    .min(1, { message: 'At least 1 candidate ID is required' })
    .max(50, { message: 'Batch invitations are capped at maximum 50 candidates per request' }),
});

export const auditLogExportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  action: z.string().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return start <= end;
    }
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
  path: ['startDate'],
});




