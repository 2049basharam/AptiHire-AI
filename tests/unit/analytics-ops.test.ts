import { describe, it, expect } from 'vitest';
import { CandidateSearchIntentSchema } from '../../src/lib/validations/search';

describe('Unit Tests: Operations & Analytics Logic', () => {
  describe('Conversion & Funnel Metrics Calculations', () => {
    it('should correctly calculate conversion percentage rates', () => {
      const calculateRate = (numerator: number, denominator: number) => {
        if (denominator <= 0) return 0;
        return Math.round((numerator / denominator) * 100);
      };

      expect(calculateRate(5, 20)).toBe(25);
      expect(calculateRate(0, 50)).toBe(0);
      expect(calculateRate(10, 0)).toBe(0);
    });

    it('should calculate time-in-stage average and median days accurately', () => {
      const durations = [2, 4, 6, 8, 10]; // Sum = 30, Avg = 6, Median = 6
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

      expect(avg).toBe(6);
      expect(median).toBe(6);
    });
  });

  describe('Tag Name Normalization Invariants', () => {
    it('should normalize tag names by trimming whitespace and converting to lowercase', () => {
      const normalizeTag = (name: string) => name.trim().toLowerCase();

      expect(normalizeTag(' Urgent ')).toBe('urgent');
      expect(normalizeTag('URGENT')).toBe('urgent');
      expect(normalizeTag('High-Priority ')).toBe('high-priority');
    });
  });

  describe('Saved Search Intent Schema Validation', () => {
    it('should validate valid CandidateSearchIntent payloads', () => {
      const payload = {
        query: 'Senior Python Developer',
        skills: ['Python', 'PostgreSQL'],
        minimumExperienceYears: 3,
        experienceLevel: 'SENIOR',
      };

      const result = CandidateSearchIntentSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skills).toContain('Python');
      }
    });

    it('should reject invalid experienceLevel enum values in search intent', () => {
      const payload = {
        experienceLevel: 'EXPERT_MASTER', // Invalid
      };

      const result = CandidateSearchIntentSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
