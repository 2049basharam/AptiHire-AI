import { z } from 'zod';

export const CandidateSearchIntentSchema = z.object({
  query: z.string().nullable().optional(),
  skills: z.array(z.string()).nullable().optional(),
  requiredSkills: z.array(z.string()).nullable().optional(),
  preferredSkills: z.array(z.string()).nullable().optional(),
  minimumExperienceYears: z.number().nullable().optional(),
  maximumExperienceYears: z.number().nullable().optional(),
  experienceLevel: z.enum(['ENTRY', 'MID', 'SENIOR', 'LEAD']).nullable().optional(),
  jobTitles: z.array(z.string()).nullable().optional(),
  locations: z.array(z.string()).nullable().optional(),
  employmentTypes: z.array(z.string()).nullable().optional(),
  candidateStatuses: z.array(z.string()).nullable().optional(),
  education: z.array(z.string()).nullable().optional(),
  similarityQuery: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
});

export type CandidateSearchIntent = z.infer<typeof CandidateSearchIntentSchema>;
