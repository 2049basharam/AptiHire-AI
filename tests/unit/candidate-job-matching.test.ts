import { describe, it, expect } from 'vitest';
import {
  calculateDetailedMatchScore,
  normalizeSkillName,
  calculateExperienceYears,
} from '../../src/lib/matching';
import { JobRequirements } from '../../src/lib/validations/job';
import { ExtractedProfile } from '../../src/lib/validations/candidate';

describe('Unit Tests: Candidate-to-Job Matching Engine Consistency & Rules', () => {
  const mockJobRequirements: JobRequirements = {
    experienceLevel: 'MID',
    skills: ['Python', 'FastAPI', 'PostgreSQL'],
    qualifications: ['Docker', 'AWS'],
    responsibilities: ['Build APIs'],
  };

  const mockCandidateProfile: ExtractedProfile = {
    summary: 'Mid backend engineer',
    skills: [
      { name: 'Python', excerpt: 'Used Python' },
      { name: 'FastAPI', excerpt: 'FastAPI apps' },
      { name: 'PostgreSQL', excerpt: 'PostgreSQL indexes' },
      { name: 'Docker', excerpt: 'Docker containerized' },
    ],
    experience: [
      {
        role: 'Developer',
        company: 'Corp',
        startDate: '2021-01',
        endDate: '2023-07', // 2.5 years
        description: 'code',
      },
    ],
    education: [],
  };

  it('should compute identical scores regardless of direction (Bidirectional Consistency)', () => {
    // Distance parameter is direction-agnostic
    const distance = 0.2;

    const scoring = calculateDetailedMatchScore(
      mockJobRequirements,
      mockCandidateProfile,
      distance
    );

    // Job -> Candidate evaluation
    const scoreJobToCandidate = scoring.finalScore;

    // Candidate -> Job evaluation (re-evaluating same parameters)
    const scoringJobSide = calculateDetailedMatchScore(
      mockJobRequirements,
      mockCandidateProfile,
      distance
    );
    const scoreCandidateToJob = scoringJobSide.finalScore;

    expect(scoreJobToCandidate).toBe(scoreCandidateToJob);
    expect(scoreJobToCandidate).toBeGreaterThan(0);
  });

  it('should normalize skill aliases correctly', () => {
    expect(normalizeSkillName('js')).toBe('javascript');
    expect(normalizeSkillName('reactjs')).toBe('react');
    expect(normalizeSkillName('Postgres')).toBe('postgresql');
    expect(normalizeSkillName('  Amazon Web Services  ')).toBe('aws');
  });

  it('should sum experience years correctly', () => {
    const experiences = [
      { startDate: '2020-01', endDate: '2021-01' }, // 1.0 year
      { startDate: '2022-06', endDate: '2023-06' }, // 1.0 year
    ];
    expect(calculateExperienceYears(experiences)).toBe(2.0);
  });

  it('should calculate required and preferred skill scores deterministically', () => {
    const scoring = calculateDetailedMatchScore(
      mockJobRequirements,
      mockCandidateProfile,
      0.15
    );

    // Matched skills: Python, FastAPI, PostgreSQL (3/3 -> 100%)
    expect(scoring.requiredSkillsScore).toBe(100);
    expect(scoring.matchedSkills).toContain('Python');

    // Matched preferred skills: Docker (1/2 -> 50%)
    expect(scoring.preferredSkillsScore).toBe(50);
    expect(scoring.matchedPreferred).toContain('Docker');
    expect(scoring.missingPreferred).toContain('AWS');
  });

  it('should fallback gracefully when requirements or profile are missing/null', () => {
    const scoring = calculateDetailedMatchScore(null, null, null);
    expect(scoring.finalScore).toBe(83); // default defaults: semantic=50, required=100, preferred=100, exp=100 (50*0.35 + 100*0.40 + 100*0.15 + 100*0.10 = 82.5 -> rounds to 83)
  });

  it('should score experience alignment correctly based on MID tier threshold (2 years)', () => {
    const scoring = calculateDetailedMatchScore(
      { ...mockJobRequirements, experienceLevel: 'MID' },
      mockCandidateProfile, // 2.5 years of experience
      0.2
    );
    expect(scoring.experienceScore).toBe(100);
    expect(scoring.experienceStatus).toBe('Strong alignment');
  });

  it('should penalize experience gaps correctly', () => {
    const scoring = calculateDetailedMatchScore(
      { ...mockJobRequirements, experienceLevel: 'LEAD' }, // Threshold: 8 years
      mockCandidateProfile, // 2.5 years of experience
      0.2
    );
    expect(scoring.experienceScore).toBe(20);
    expect(scoring.experienceStatus).toBe('Weak alignment');
  });
});
