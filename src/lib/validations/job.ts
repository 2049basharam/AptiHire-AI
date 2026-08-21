import { z } from 'zod';

export type JobStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

// --- Canonical Job Requirements Schema (allowing empty arrays) ---
export const jobRequirementsSchema = z.object({
  experienceLevel: z.enum(['ENTRY', 'MID', 'SENIOR', 'LEAD']).nullable().optional(),
  skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
});

export type JobRequirements = z.infer<typeof jobRequirementsSchema>;

// --- Job Input Validation Schemas ---
export const createJobSchema = z.object({
  title: z.string().min(2, "Job title must be at least 2 characters").max(255),
  description: z.string().min(10, "Job description must be at least 10 characters"),
  requirements: jobRequirementsSchema.optional(),
});

export const updateJobSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().min(10).optional(),
  requirements: jobRequirementsSchema.optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

// --- Deterministic Status State Machine ---
export function isValidStatusTransition(current: JobStatus, next: JobStatus): boolean {
  if (current === next) return true;
  if (current === 'DRAFT' && (next === 'PUBLISHED' || next === 'ARCHIVED')) return true;
  if (current === 'PUBLISHED' && next === 'ARCHIVED') return true;
  return false;
}

// --- Publication Business Rules Validator ---
export function canPublishJob(requirements: JobRequirements | null | undefined): { valid: boolean; reason?: string } {
  if (!requirements) {
    return { valid: false, reason: "Requirements must be configured before publishing." };
  }
  
  const result = jobRequirementsSchema.safeParse(requirements);
  if (!result.success) {
    return { valid: false, reason: "Invalid requirements format." };
  }

  const data = result.data;
  if (!data.experienceLevel) {
    return { valid: false, reason: "Experience level must be set before publishing." };
  }
  if (data.skills.length === 0) {
    return { valid: false, reason: "At least one skill is required before publishing." };
  }
  if (data.responsibilities.length === 0) {
    return { valid: false, reason: "At least one responsibility is required before publishing." };
  }

  return { valid: true };
}
