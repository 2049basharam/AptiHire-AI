import { describe, it, expect } from 'vitest';
import { CandidateSearchIntentSchema } from '../../src/lib/validations/search';

describe('Unit Tests: Natural-Language Candidate Search Intent Validation', () => {
  it('should successfully parse valid candidate search intent object', () => {
    const rawIntent = {
      query: 'Find Python backend developers with FastAPI',
      requiredSkills: ['Python', 'FastAPI'],
      preferredSkills: ['PostgreSQL'],
      minimumExperienceYears: 3,
      experienceLevel: 'MID',
      limit: 20,
    };

    const parsed = CandidateSearchIntentSchema.safeParse(rawIntent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.requiredSkills).toContain('Python');
      expect(parsed.data.minimumExperienceYears).toBe(3);
      expect(parsed.data.experienceLevel).toBe('MID');
    }
  });

  it('should fallback and allow empty/null-safe defaults', () => {
    const parsed = CandidateSearchIntentSchema.safeParse({
      query: 'Any software engineer',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.query).toBe('Any software engineer');
      expect(parsed.data.requiredSkills).toBeUndefined();
    }
  });

  it('should reject invalid experience level enum values', () => {
    const parsed = CandidateSearchIntentSchema.safeParse({
      query: 'Senior developer',
      experienceLevel: 'SUPER_SENIOR', // Invalid enum value
    });
    expect(parsed.success).toBe(false);
  });
});
