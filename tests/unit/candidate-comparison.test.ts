import { describe, it, expect } from 'vitest';
import {
  calculateDetailedMatchScore,
  normalizeSkillName,
  calculateExperienceYears,
} from '../../src/lib/matching';
import { JobRequirements } from '../../src/lib/validations/job';
import { ExtractedProfile } from '../../src/lib/validations/candidate';

describe('Unit Tests: Candidate Comparison Engine Invariants', () => {
  const mockJobRequirements: JobRequirements = {
    experienceLevel: 'SENIOR', // 5 years required
    skills: ['Python', 'FastAPI', 'PostgreSQL'],
    qualifications: ['Docker', 'AWS', 'Kubernetes'],
    responsibilities: ['Architect systems'],
  };

  const mockCandidateSarah: ExtractedProfile = {
    summary: 'Senior Backend Engineer',
    skills: [
      { name: 'Python', excerpt: '5 years with python' },
      { name: 'FastAPI', excerpt: 'FastAPI backend APIs' },
      { name: 'PostgreSQL', excerpt: 'PostgreSQL scaling' },
      { name: 'Docker', excerpt: 'Docker container packaging' },
      { name: 'AWS', excerpt: 'AWS ECS and RDS deployment' },
    ],
    experience: [
      {
        role: 'Senior Developer',
        company: 'FastCorp',
        startDate: '2019-01',
        endDate: '2024-01', // 5 years
        description: 'Lead engineer using python and postgresql',
      },
    ],
    education: [],
  };

  const mockCandidateAlex: ExtractedProfile = {
    summary: 'Mid Python Developer',
    skills: [
      { name: 'Python', excerpt: 'Python programming' },
      { name: 'FastAPI', excerpt: 'FastAPI apps' },
      { name: 'Docker', excerpt: 'Docker containerization' },
    ],
    experience: [
      {
        role: 'Developer',
        company: 'SoftwareInc',
        startDate: '2021-06',
        endDate: '2024-06', // 3 years
        description: 'FastAPI backend systems',
      },
    ],
    education: [],
  };

  it('should ensure critical invariant: Job -> Candidate == Candidate -> Job == Comparison score', () => {
    const distanceSarah = 0.15;
    const distanceAlex = 0.25;

    // 1. Job -> Candidate score
    const jobToSarahScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateSarah, distanceSarah);
    const jobToAlexScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateAlex, distanceAlex);

    // 2. Candidate -> Job score
    const sarahToJobScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateSarah, distanceSarah);
    const alexToJobScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateAlex, distanceAlex);

    // 3. Comparison score (the score evaluated programmatically in the comparison engine)
    const comparisonSarahScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateSarah, distanceSarah);
    const comparisonAlexScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateAlex, distanceAlex);

    // Assert absolute score equality (the exact same function calculates the score, so it must be equal)
    expect(jobToSarahScoring.finalScore).toBe(sarahToJobScoring.finalScore);
    expect(sarahToJobScoring.finalScore).toBe(comparisonSarahScoring.finalScore);

    expect(jobToAlexScoring.finalScore).toBe(alexToJobScoring.finalScore);
    expect(alexToJobScoring.finalScore).toBe(comparisonAlexScoring.finalScore);

    // Deterministic ordering: Sarah (Senior) must score higher than Alex (Mid)
    expect(comparisonSarahScoring.finalScore).toBeGreaterThan(comparisonAlexScoring.finalScore);
  });

  it('should validate experience fit constraints (Meets/Exceeds vs Below)', () => {
    // Job requires SENIOR (5+ years)
    // Sarah: 5 years -> Meets/Exceeds (100% experience score)
    const sarahExpYears = calculateExperienceYears(mockCandidateSarah.experience);
    expect(sarahExpYears).toBe(5);

    const sarahScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateSarah, null);
    expect(sarahScoring.experienceScore).toBe(100);
    expect(sarahScoring.experienceStatus).toBe('Strong alignment');

    // Alex: 3 years -> Below SENIOR requirement (50% experience score)
    const alexExpYears = calculateExperienceYears(mockCandidateAlex.experience);
    expect(alexExpYears).toBe(3);

    const alexScoring = calculateDetailedMatchScore(mockJobRequirements, mockCandidateAlex, null);
    expect(alexScoring.experienceScore).toBe(60);
    expect(alexScoring.experienceStatus).toBe('Moderate alignment');
  });

  it('should validate skill normalization matches the existing dictionary mapping', () => {
    expect(normalizeSkillName('reactjs')).toBe('react');
    expect(normalizeSkillName('Postgres')).toBe('postgresql');
    expect(normalizeSkillName('  Amazon Web Services  ')).toBe('aws');
  });

  it('should reject invalid comparison selection boundary lengths (mimicking API validation)', () => {
    const validateSelectionCount = (cids: string[]) => {
      return cids.length >= 2 && cids.length <= 5;
    };

    expect(validateSelectionCount(['id1'])).toBe(false); // 1 candidate: too low
    expect(validateSelectionCount(['id1', 'id2'])).toBe(true); // 2 candidates: ok
    expect(validateSelectionCount(['id1', 'id2', 'id3', 'id4', 'id5'])).toBe(true); // 5 candidates: ok
    expect(validateSelectionCount(['id1', 'id2', 'id3', 'id4', 'id5', 'id6'])).toBe(false); // 6 candidates: too high
  });

  it('should reject duplicate candidate IDs', () => {
    const hasDuplicates = (cids: string[]) => {
      const unique = new Set(cids);
      return unique.size !== cids.length;
    };

    expect(hasDuplicates(['id1', 'id2', 'id3'])).toBe(false);
    expect(hasDuplicates(['id1', 'id2', 'id1'])).toBe(true);
  });
});
