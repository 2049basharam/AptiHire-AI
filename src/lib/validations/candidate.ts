import { z } from 'zod';

export const CandidateStatusSchema = z.enum([
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'EXTRACTED',
  'AI_PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
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
