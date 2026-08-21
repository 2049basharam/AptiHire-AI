import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  jobRequirementsSchema,
  isValidStatusTransition,
  canPublishJob,
} from '../../src/lib/validations/job';
import { getAIProvider, TestAIProvider } from '../../src/lib/ai/provider';

describe('Unit Tests: Job Management & Validation Business Rules', () => {
  describe('Canonical Job Requirements Schema Validation', () => {
    it('should validate complete job requirements structure', () => {
      const valid = {
        experienceLevel: 'SENIOR',
        skills: ['TypeScript', 'Next.js'],
        responsibilities: ['Build UI'],
        qualifications: ['B.S. Computer Science'],
      };
      const result = jobRequirementsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should allow legitimate empty arrays (grounding rules compliance)', () => {
      const validWithEmpty = {
        experienceLevel: null,
        skills: [],
        responsibilities: [],
        qualifications: [],
      };
      const result = jobRequirementsSchema.safeParse(validWithEmpty);
      expect(result.success).toBe(true);
      expect(result.data?.skills).toEqual([]);
      expect(result.data?.qualifications).toEqual([]);
    });

    it('should fail validation on invalid experienceLevel', () => {
      const invalidLevel = {
        experienceLevel: 'INTERMEDIATE', // Invalid enum value
        skills: [],
        responsibilities: [],
        qualifications: [],
      };
      const result = jobRequirementsSchema.safeParse(invalidLevel);
      expect(result.success).toBe(false);
    });
  });

  describe('Deterministic Job Status State Machine', () => {
    it('should ALLOW valid transitions', () => {
      expect(isValidStatusTransition('DRAFT', 'PUBLISHED')).toBe(true);
      expect(isValidStatusTransition('DRAFT', 'ARCHIVED')).toBe(true);
      expect(isValidStatusTransition('PUBLISHED', 'ARCHIVED')).toBe(true);
      
      // Self-transitions are valid
      expect(isValidStatusTransition('DRAFT', 'DRAFT')).toBe(true);
      expect(isValidStatusTransition('PUBLISHED', 'PUBLISHED')).toBe(true);
      expect(isValidStatusTransition('ARCHIVED', 'ARCHIVED')).toBe(true);
    });

    it('should REJECT invalid transitions', () => {
      expect(isValidStatusTransition('PUBLISHED', 'DRAFT')).toBe(false);
      expect(isValidStatusTransition('ARCHIVED', 'DRAFT')).toBe(false);
      expect(isValidStatusTransition('ARCHIVED', 'PUBLISHED')).toBe(false);
    });
  });

  describe('Publication Business Validation Rules', () => {
    it('should allow publishing if requirements are complete', () => {
      const requirements = {
        experienceLevel: 'SENIOR' as const,
        skills: ['TypeScript'],
        responsibilities: ['Write code'],
        qualifications: [],
      };
      const check = canPublishJob(requirements);
      expect(check.valid).toBe(true);
    });

    it('should deny publishing if experience level is missing', () => {
      const requirements = {
        experienceLevel: null,
        skills: ['TypeScript'],
        responsibilities: ['Write code'],
        qualifications: [],
      };
      const check = canPublishJob(requirements);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Experience level must be set');
    });

    it('should deny publishing if skills are empty', () => {
      const requirements = {
        experienceLevel: 'MID' as const,
        skills: [],
        responsibilities: ['Write code'],
        qualifications: [],
      };
      const check = canPublishJob(requirements);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('At least one skill is required');
    });
  });

  describe('TestAIProvider & Grounding Rules', () => {
    it('should only extract grounded details and allow empty qualifications', async () => {
      const provider = new TestAIProvider();
      
      // Grounding fixture input
      const description = 'Looking for a Python developer with PostgreSQL experience.';
      const output = await provider.extractJobRequirements(description);
      
      expect(output.skills).toContain('Python');
      expect(output.skills).toContain('PostgreSQL');
      
      // Grounding verify: no React, AWS, or ungrounded technologies are invented
      expect(output.skills).not.toContain('React');
      expect(output.skills).not.toContain('AWS');
      
      // Grounding verify: qualifications remains empty
      expect(output.qualifications).toEqual([]);
    });

    it('should return empty fields if description is empty', async () => {
      const provider = new TestAIProvider();
      const output = await provider.extractJobRequirements('');
      
      expect(output.experienceLevel).toBeNull();
      expect(output.skills).toEqual([]);
      expect(output.responsibilities).toEqual([]);
      expect(output.qualifications).toEqual([]);
    });
  });

  describe('AIProvider Factory Safety (Fail-Closed)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should ALLOW TestAIProvider when global.__TEST_AI_PROVIDER__ is injected', () => {
      (global as any).__TEST_AI_PROVIDER__ = true;

      const provider = getAIProvider();
      expect(provider).toBeInstanceOf(TestAIProvider);
      
      delete (global as any).__TEST_AI_PROVIDER__;
    });

    it('should return null if API key is missing and no test provider is injected', () => {
      delete (global as any).__TEST_AI_PROVIDER__;
      delete process.env.GEMINI_API_KEY;

      const provider = getAIProvider();
      expect(provider).toBeNull();
    });
  });
});
