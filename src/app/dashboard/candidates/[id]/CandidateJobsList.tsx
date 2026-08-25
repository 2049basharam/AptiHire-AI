'use client';

import { useState } from 'react';
import Link from 'next/link';
import MatchDetailModal from '../../jobs/[id]/MatchDetailModal';

interface JobMatchResult {
  job: {
    id: string;
    title: string;
    description: string;
    status: string;
    createdAt: string;
  };
  match: {
    finalScore: number;
    semanticScore: number;
    requiredSkillsScore: number;
    preferredSkillsScore: number;
    experienceScore: number;
    experienceStatus: string;
    candidateYears: number;
    matchedSkills: string[];
    missingSkills: string[];
    matchedPreferred: string[];
    missingPreferred: string[];
  };
}

interface CandidateJobsListProps {
  candidateId: string;
  candidateName: string;
  results: JobMatchResult[];
}

export default function CandidateJobsList({
  candidateId,
  candidateName,
  results,
}: CandidateJobsListProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} id="ranked-matching-jobs-list">
      {results.map(({ job, match }) => (
        <div
          key={job.id}
          className="card job-match-card"
          style={{
            padding: '1.25rem',
            border: '1px solid hsl(var(--border))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1.5rem',
            transition: 'transform 0.2s',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                {job.title}
              </h4>
              <span className="badge badge-secondary" style={{ fontSize: '0.675rem' }}>
                {job.status}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.825rem', color: 'hsl(var(--foreground) / 0.6)' }}>
              <span>Experience Match: <strong>{match.experienceStatus}</strong> ({match.candidateYears.toFixed(1)} yrs candidate)</span>
            </div>

            {/* Skills indicators */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.25rem' }}>
              {match.matchedSkills.map((skill, index) => (
                <span
                  key={index}
                  className="badge badge-success"
                  style={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  ✓ {skill}
                </span>
              ))}
              {match.missingSkills.map((skill, index) => (
                <span
                  key={index}
                  className="badge badge-secondary"
                  style={{ fontSize: '0.75rem', opacity: 0.8 }}
                >
                  ! {skill}
                </span>
              ))}
            </div>

            {/* Gap warnings */}
            {match.missingSkills.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--danger))', marginTop: '0.25rem' }} className="potential-gap-warning">
                Potential gap: {match.missingSkills[0]} — Not Found
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', minWidth: '120px' }}>
            <div
              style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--accent))' }}
              className="job-match-score"
            >
              {match.finalScore}%
            </div>
            <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.4)', fontWeight: 600 }}>
              Match Score
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setSelectedJobId(job.id)}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                id={`btn-view-match-${job.id}`}
              >
                View Match
              </button>
              <Link
                href={`/dashboard/jobs/${job.id}`}
                className="btn btn-primary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', textDecoration: 'none' }}
                id={`btn-open-job-${job.id}`}
              >
                Open Job
              </Link>
            </div>
          </div>
        </div>
      ))}

      {/* Render Match Detail Modal */}
      {selectedJobId && (
        <MatchDetailModal
          isOpen={true}
          onClose={() => setSelectedJobId(null)}
          jobId={selectedJobId}
          candidateId={candidateId}
          candidateName={candidateName}
          onStatusUpdated={() => {}}
        />
      )}
    </div>
  );
}
