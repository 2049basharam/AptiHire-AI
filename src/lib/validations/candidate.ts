import { z } from 'zod';

export const CandidateStatusSchema = z.enum([
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'EXTRACTED',
  'AI_PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'SHORTLISTED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
  'FAILED_EXTRACTION',
  'FAILED_AI'
]);

export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const ExtractedProfileSchema = z.object({
  summary: z.string().nullable(),
  skills: z.array(z.object({
    name: z.string(),
    excerpt: z.string() // verbatim snippet from the resume text
  })),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    description: z.string()
  })),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string().nullable()
  }))
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

// Schema for recruiter candidate edit operations
export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100).nullable().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  summary: z.string().nullable().optional(),
  status: z.enum([
    'APPROVED',
    'SHORTLISTED',
    'SCREENING',
    'INTERVIEW',
    'OFFER',
    'HIRED',
    'REJECTED',
    'WITHDRAWN'
  ]).optional(),
  jobId: z.string().uuid().optional(),
  reason: z.string().max(255).optional(),
  notes: z.string().optional(),
  expectedPreviousStatus: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    excerpt: z.string()
  })).optional(),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    description: z.string()
  })).optional(),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string().nullable()
  })).optional()
});

export type UpdateProfilePayload = z.infer<typeof UpdateProfileSchema>;

// Strict state transition machine definition
const CANDIDATE_TRANSITION_MAP: Record<string, string[]> = {
  REVIEW_REQUIRED: ['APPROVED', 'REJECTED'],
  APPROVED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['SCREENING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'SCREENING', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['HIRED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  HIRED: ['OFFER', 'WITHDRAWN'],
  REJECTED: ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER'], // allow undoing rejection
  WITHDRAWN: ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER'], // allow undoing withdrawal
};

export function isValidCandidateTransition(current: string, next: string): boolean {
  if (current === next) return true;

  const allowed = CANDIDATE_TRANSITION_MAP[current];
  if (allowed && allowed.includes(next)) return true;

  // Background worker automated flows
  if (current === 'UPLOADED' && ['QUEUED', 'PROCESSING', 'FAILED_EXTRACTION'].includes(next)) return true;
  if (current === 'QUEUED' && ['PROCESSING', 'FAILED_EXTRACTION'].includes(next)) return true;
  if (current === 'PROCESSING' && ['AI_PROCESSING', 'FAILED_EXTRACTION'].includes(next)) return true;
  if (current === 'AI_PROCESSING' && ['REVIEW_REQUIRED', 'APPROVED', 'FAILED_AI'].includes(next)) return true;

  return false;
}
