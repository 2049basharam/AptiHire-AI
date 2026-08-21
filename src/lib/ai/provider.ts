import { JobRequirements } from '../validations/job';
import { ExtractedProfile } from '../validations/candidate';
import { GeminiAdapter } from './gemini';

export interface AIProvider {
  extractJobRequirements(description: string): Promise<JobRequirements>;
  extractCandidateProfile(resumeText: string): Promise<ExtractedProfile>;
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Test AI Provider used strictly for E2E and unit testing.
 * Returns deterministic candidate fixtures and mock embeddings.
 */
export class TestAIProvider implements AIProvider {
  async extractJobRequirements(description: string): Promise<JobRequirements> {
    const trimmed = description.trim();
    
    // Check if input is empty
    if (!trimmed) {
      return {
        experienceLevel: null,
        skills: [],
        responsibilities: [],
        qualifications: [],
      };
    }

    // Fixture 1: Grounding test for specific technologies
    if (trimmed.includes('Python') || trimmed.includes('PostgreSQL')) {
      return {
        experienceLevel: 'MID',
        skills: ['Python', 'PostgreSQL'],
        responsibilities: ['Develop backend systems', 'Optimize database queries'],
        qualifications: [], // Grounding verify: qualifications remain empty
      };
    }

    // Default E2E test mock requirements output
    return {
      experienceLevel: 'SENIOR',
      skills: ['TypeScript', 'Next.js', 'React'],
      responsibilities: ['Build user interfaces', 'Collaborate with product teams'],
      qualifications: ['Bachelor\'s degree in Computer Science'],
    };
  }

  async extractCandidateProfile(resumeText: string): Promise<ExtractedProfile> {
    const trimmed = resumeText.trim();

    if (!trimmed) {
      return {
        summary: null,
        skills: [],
        experience: [],
        education: [],
      };
    }

    // Prompt injection check: verify injection is ignored and processed strictly as data
    if (trimmed.includes('Ignore previous instructions') || trimmed.includes('ignore instructions')) {
      return {
        summary: 'Parsed Candidate with ignored prompt injection payload.',
        skills: [
          { name: 'TypeScript', excerpt: 'Used TypeScript for frontend development' }
        ],
        experience: [
          {
            role: 'Software Engineer',
            company: 'Vercel',
            startDate: '2023-01',
            endDate: null,
            description: 'Created Next.js applications and worked with serverless technologies.'
          }
        ],
        education: [
          { degree: 'B.S. Computer Science', institution: 'MIT', year: '2022' }
        ],
      };
    }

    // Grounding fixture 1: specific skills and experiences
    if (trimmed.includes('Python') || trimmed.includes('PostgreSQL')) {
      return {
        summary: 'Experienced Back-End Developer specializing in Python and PostgreSQL.',
        skills: [
          { name: 'Python', excerpt: 'Developed core API services in Python' },
          { name: 'PostgreSQL', excerpt: 'Optimized PostgreSQL query index configurations' }
        ],
        experience: [
          {
            role: 'Backend Engineer',
            company: 'TechCorp',
            startDate: '2021-06',
            endDate: '2024-02',
            description: 'Owned data storage layers, configured Redis queues, and optimized DB operations.'
          }
        ],
        education: [
          { degree: 'B.S. Software Engineering', institution: 'Stanford University', year: '2021' }
        ],
      };
    }

    // Default parsed candidate profile
    return {
      summary: 'Senior Frontend Architect with expertise in React, TypeScript, and Next.js.',
      skills: [
        { name: 'TypeScript', excerpt: 'Developed large scale TypeScript apps' },
        { name: 'React', excerpt: 'React component library creator' },
        { name: 'Next.js', excerpt: 'Migrated monolithic systems to Next.js 15 App Router' }
      ],
      experience: [
        {
          role: 'Lead Architect',
          company: 'Aptivision',
          startDate: '2020-05',
          endDate: null,
          description: 'Migrated web services, designed developer tooling frameworks, and built UI widgets.'
        }
      ],
      education: [
        { degree: 'B.S. Computer Science', institution: 'MIT', year: '2019' }
      ],
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Generate a deterministic 768-dimensional mock vector for testing
    const vector = new Array(768).fill(0.0);
    // Add small variance based on the input text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 768; i++) {
      vector[i] = Math.abs((Math.sin(hash + i) * 10) % 1);
    }
    return vector;
  }
}

/**
 * AI Provider Factory resolving the appropriate AI extraction implementation.
 * Leverages explicit runtime context injection for testing, ensuring that
 * the TestAIProvider can never be accidentally invoked in production.
 */
export function getAIProvider(): AIProvider | null {
  // Explicit provider injection check for automated test environments
  if (typeof global !== 'undefined' && (global as typeof globalThis & { __TEST_AI_PROVIDER__?: boolean }).__TEST_AI_PROVIDER__) {
    return new TestAIProvider();
  }

  // Production/Development environments strictly use GeminiAdapter
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GeminiAdapter(apiKey);
}
