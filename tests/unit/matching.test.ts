import { describe, it, expect } from 'vitest';
import {
  normalizeSkillName,
  calculateExperienceYears,
  getExperienceScore,
  calculateDetailedMatchScore,
} from '../../src/lib/matching';

describe('Unit Tests: Semantic Candidate Matching Logic', () => {
  describe('normalizeSkillName', () => {
    it('should correctly normalize casing and whitespace', () => {
      expect(normalizeSkillName('  TypeScript  ')).toBe('typescript');
      expect(normalizeSkillName('React  JS')).toBe('react js');
    });

    it('should map common technical aliases', () => {
      expect(normalizeSkillName('js')).toBe('javascript');
      expect(normalizeSkillName('reactjs')).toBe('react');
      expect(normalizeSkillName('React.js')).toBe('react');
      expect(normalizeSkillName('postgres')).toBe('postgresql');
      expect(normalizeSkillName('k8s')).toBe('kubernetes');
      expect(normalizeSkillName('amazon web services')).toBe('aws');
    });
  });

  describe('calculateExperienceYears', () => {
    it('should calculate experience correctly with explicit start/end dates', () => {
      const experiences = [
        { startDate: '2020-01-01', endDate: '2022-01-01' }, // 2 years
        { startDate: '2023-01-01', endDate: '2024-07-01' }, // 1.5 years
      ];
      expect(calculateExperienceYears(experiences)).toBe(3.5);
    });

    it('should fallback to current date for Present/Current/null endDates', () => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 3, now.getMonth());
      const experiences = [
        { startDate: start.toISOString(), endDate: 'Present' }
      ];
      expect(calculateExperienceYears(experiences)).toBe(3);
    });

    it('should return 0 for empty or invalid experiences', () => {
      expect(calculateExperienceYears([])).toBe(0);
      expect(calculateExperienceYears([{ startDate: 'invalid-date' }])).toBe(0);
    });
  });

  describe('getExperienceScore', () => {
    it('should return 100 if no required level is specified', () => {
      expect(getExperienceScore(null, 5).score).toBe(100);
    });

    it('should return correct alignment for matching or exceeding experience', () => {
      const match1 = getExperienceScore('SENIOR', 6); // threshold 5
      expect(match1.score).toBe(100);
      expect(match1.status).toBe('Strong alignment');

      const match2 = getExperienceScore('MID', 2); // threshold 2
      expect(match2.score).toBe(100);
    });

    it('should return moderate alignment score for minor deficits', () => {
      const match = getExperienceScore('SENIOR', 3.5); // threshold 5, deficit is 1.5 yrs
      expect(match.score).toBe(60);
      expect(match.status).toBe('Moderate alignment');
    });

    it('should return weak alignment score for major deficits', () => {
      const match = getExperienceScore('LEAD', 2); // threshold 8, deficit is 6 yrs
      expect(match.score).toBe(20);
      expect(match.status).toBe('Weak alignment');
    });
  });

  describe('calculateDetailedMatchScore', () => {
    const jobRequirements = {
      experienceLevel: 'MID' as const, // 2 years required
      skills: ['Python', 'PostgreSQL'],
      qualifications: ['AWS'],
      responsibilities: [] as string[],
    };

    const candidateProfile = {
      summary: null,
      skills: [
        { name: 'python', excerpt: 'Used Python for 3 years' },
        { name: 'postgres', excerpt: 'Optimized postgres database' },
      ],
      experience: [
        { role: 'Developer', company: 'Org', description: 'desc', startDate: '2021-01-01', endDate: '2023-01-01' }, // 2 years
      ],
      education: [] as any[],
    };

    it('should calculate perfect required skill coverage and correct hybrid weights', () => {
      // Cosine distance of 0.2 means similarity of 0.8 (80%)
      const result = calculateDetailedMatchScore(jobRequirements, candidateProfile, 0.2);

      // semantic: 80% (wt 0.35) -> 28
      // required: 100% (wt 0.40) -> 40
      // preferred: 0% (wt 0.15) -> 0
      // experience: 100% (wt 0.10) -> 10 (candidate has 2 years, MID needs 2)
      // Total: 28 + 40 + 0 + 10 = 78%
      expect(result.finalScore).toBe(78);
      expect(result.semanticScore).toBe(80);
      expect(result.requiredSkillsScore).toBe(100);
      expect(result.preferredSkillsScore).toBe(0);
      expect(result.experienceScore).toBe(100);
      expect(result.matchedSkills).toContain('Python');
      expect(result.matchedSkills).toContain('PostgreSQL');
      expect(result.missingSkills.length).toBe(0);
      expect(result.missingPreferred).toContain('AWS');
    });

    it('should fallback gracefully when cosine distance is missing', () => {
      const result = calculateDetailedMatchScore(jobRequirements, candidateProfile, null);
      // semantic fallback: 50% (wt 0.35) -> 17.5 (rounds to 18)
      // required: 100% (wt 0.40) -> 40
      // preferred: 0% -> 0
      // experience: 100% -> 10
      // Total: 17.5 + 40 + 0 + 10 = 67.5 -> 68%
      expect(result.finalScore).toBe(68);
    });
  });
});
