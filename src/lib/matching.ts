import { JobRequirements } from './validations/job';
import { ExtractedProfile } from './validations/candidate';

export const SEMANTIC_WEIGHT = 0.35;
export const REQUIRED_SKILLS_WEIGHT = 0.40;
export const PREFERRED_SKILLS_WEIGHT = 0.15;
export const EXPERIENCE_WEIGHT = 0.10;

const ALIAS_MAP: Record<string, string> = {
  'js': 'javascript',
  'reactjs': 'react',
  'react.js': 'react',
  'nodejs': 'node.js',
  'node': 'node.js',
  'postgres': 'postgresql',
  'ts': 'typescript',
  'mongo': 'mongodb',
  'k8s': 'kubernetes',
  'amazon web services': 'aws',
};

/**
 * Normalizes skill names to resolve case, spacing, and alias naming differences.
 */
export function normalizeSkillName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  const clean = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIAS_MAP[clean] || clean;
}

/**
 * Sums up duration across candidate experiences in years.
 */
export function calculateExperienceYears(
  experiences: Array<{ startDate?: string | null; endDate?: string | null }> | null | undefined
): number {
  if (!Array.isArray(experiences) || experiences.length === 0) return 0;
  
  let totalMonths = 0;
  for (const exp of experiences) {
    if (!exp.startDate) continue;
    
    const start = new Date(exp.startDate);
    if (isNaN(start.getTime())) continue;
    
    let end = new Date();
    if (exp.endDate && exp.endDate !== 'Present' && exp.endDate !== 'Current') {
      const parsedEnd = new Date(exp.endDate);
      if (!isNaN(parsedEnd.getTime())) {
        end = parsedEnd;
      }
    }
    
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (diffMonths > 0) {
      totalMonths += diffMonths;
    }
  }
  
  return Math.round((totalMonths / 12) * 10) / 10;
}

const EXPERIENCE_LEVELS = {
  'ENTRY': 0,
  'MID': 2,
  'SENIOR': 5,
  'LEAD': 8,
};

/**
 * Calculates experience alignment scoring based on target experience levels.
 */
export function getExperienceScore(requiredLevel: string | null | undefined, candidateYears: number): { score: number, status: string } {
  if (!requiredLevel) return { score: 100, status: 'Strong alignment' };
  
  const threshold = EXPERIENCE_LEVELS[requiredLevel as keyof typeof EXPERIENCE_LEVELS];
  if (threshold === undefined) return { score: 100, status: 'Strong alignment' };
  
  if (candidateYears >= threshold) {
    return { score: 100, status: 'Strong alignment' };
  } else if (candidateYears >= Math.max(0, threshold - 2)) {
    return { score: 60, status: 'Moderate alignment' };
  } else {
    return { score: 20, status: 'Weak alignment' };
  }
}

/**
 * Calculates the complete hybrid match breakdown score for a candidate against a job.
 */
export function calculateDetailedMatchScore(
  jobRequirements: JobRequirements | null | undefined,
  candidateProfile: ExtractedProfile | null | undefined,
  cosineDistanceValue: number | null | undefined,
  evidenceList?: Array<{ skill: string; excerpt: string }> | null
) {
  // 1. Semantic Score (cosine distance)
  let semanticScore = 0;
  if (cosineDistanceValue !== null && cosineDistanceValue !== undefined) {
    const similarity = 1 - cosineDistanceValue;
    semanticScore = Math.max(0, Math.min(100, Math.round(similarity * 100)));
  } else {
    semanticScore = 50; // fallback default
  }

  // Normalize candidate skills
  const candidateSkills = Array.isArray(candidateProfile?.skills) ? candidateProfile.skills : [];
  const candidateSkillsNormalized = candidateSkills.map((s: unknown) => {
    let name = '';
    let excerpt = '';
    if (typeof s === 'string') {
      name = s;
    } else if (s && typeof s === 'object' && 'name' in s) {
      name = String((s as { name: unknown }).name);
      excerpt = 'excerpt' in s ? String((s as { excerpt: unknown }).excerpt) : '';
    }
    
    const norm = normalizeSkillName(name);
    if (evidenceList) {
      const ev = evidenceList.find(e => normalizeSkillName(e.skill) === norm);
      if (ev) excerpt = ev.excerpt;
    }
    
    return {
      original: name,
      normalized: norm,
      excerpt
    };
  });

  // 2. Required Skills Match
  const requiredSkills = Array.isArray(jobRequirements?.skills) ? jobRequirements.skills : [];
  let requiredSkillsScore = 100;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  const skillGroundingMap: Record<string, string> = {};

  if (requiredSkills.length > 0) {
    let matchedCount = 0;
    for (const reqSkill of requiredSkills) {
      const normReq = normalizeSkillName(reqSkill);
      const match = candidateSkillsNormalized.find((s) => s.normalized === normReq);
      if (match) {
        matchedCount++;
        matchedSkills.push(reqSkill);
        skillGroundingMap[reqSkill] = match.excerpt || 'Found in profile summary or experiences.';
      } else {
        missingSkills.push(reqSkill);
      }
    }
    requiredSkillsScore = Math.round((matchedCount / requiredSkills.length) * 100);
  }

  // 3. Preferred Skills (Qualifications) Match
  const preferredSkills = Array.isArray(jobRequirements?.qualifications) ? jobRequirements.qualifications : [];
  let preferredSkillsScore = 100;
  const matchedPreferred: string[] = [];
  const missingPreferred: string[] = [];

  if (preferredSkills.length > 0) {
    let matchedCount = 0;
    for (const prefSkill of preferredSkills) {
      const normPref = normalizeSkillName(prefSkill);
      const match = candidateSkillsNormalized.find((s) => s.normalized === normPref);
      if (match) {
        matchedCount++;
        matchedPreferred.push(prefSkill);
      } else {
        missingPreferred.push(prefSkill);
      }
    }
    preferredSkillsScore = Math.round((matchedCount / preferredSkills.length) * 100);
  }

  // 4. Experience Match
  const candidateYears = calculateExperienceYears(candidateProfile?.experience || []);
  const { score: experienceScore, status: experienceStatus } = getExperienceScore(
    jobRequirements?.experienceLevel,
    candidateYears
  );

  // 5. Final Hybrid Score
  const finalScore = Math.round(
    semanticScore * SEMANTIC_WEIGHT +
    requiredSkillsScore * REQUIRED_SKILLS_WEIGHT +
    preferredSkillsScore * PREFERRED_SKILLS_WEIGHT +
    experienceScore * EXPERIENCE_WEIGHT
  );

  return {
    finalScore,
    semanticScore,
    requiredSkillsScore,
    preferredSkillsScore,
    experienceScore,
    experienceStatus,
    candidateYears,
    matchedSkills,
    missingSkills,
    matchedPreferred,
    missingPreferred,
    skillGroundingMap
  };
}
