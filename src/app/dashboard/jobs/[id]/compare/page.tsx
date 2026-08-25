'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface CandidateComparisonResult {
  job: {
    id: string;
    title: string;
  };
  candidates: Array<{
    id: string;
    name: string;
    status: string;
    match: {
      finalScore: number;
      semanticScore: number;
      requiredSkillsScore: number;
      preferredSkillsScore: number;
      experienceScore: number;
      contributions: {
        semantic: number;
        requiredSkills: number;
        preferredSkills: number;
        experience: number;
      };
    };
    skills: Array<{
      name: string;
      category: string;
      status: string;
      evidence: string | null;
    }>;
    experience: {
      years: number;
      requiredLevel: string;
      alignment: string;
    };
  }>;
  aiSummary: string | null;
}

export default function CandidateComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = use(params);
  const [candidatesParam, setCandidatesParam] = useState<string>('');
  const [data, setData] = useState<CandidateComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const candidates = urlParams.get('candidates') || '';
      setCandidatesParam(candidates);
    }
  }, []);

  useEffect(() => {
    if (!candidatesParam) return;

    const fetchComparison = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/jobs/${jobId}/compare?candidates=${candidatesParam}`);
        const parsed = await response.json();
        if (!response.ok) {
          throw new Error(parsed.error?.message || 'Failed to fetch comparison details.');
        }
        setData(parsed);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [jobId, candidatesParam]);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))' }}>
        <div style={{ textAlign: 'center' }} id="comparison-loading-spinner">
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            Compiling Candidate Scorecards...
          </div>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.5rem' }}>
            Retrieving evidence matrices and running deterministic matching engines.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))' }}>
        <div className="card" style={{ maxWidth: '440px', textAlign: 'center' }} id="comparison-error-card">
          <div style={{ color: 'hsl(var(--danger))', fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Comparison Failed
          </div>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)', marginBottom: '1.5rem' }}>
            {error || 'No comparison details available.'}
          </p>
          <Link href={`/dashboard/jobs/${jobId}`} className="btn btn-secondary">
            Back to Job Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'hsl(var(--background))', paddingBottom: '3rem' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link href="/dashboard" style={{ fontWeight: 700, fontSize: '1.25rem', textDecoration: 'none', color: 'hsl(var(--foreground))' }}>
              AptiHire AI
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <Link href="/dashboard/jobs" style={{ fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', color: 'hsl(var(--foreground) / 0.6)' }}>
              Jobs
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <Link href={`/dashboard/jobs/${jobId}`} style={{ fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', color: 'hsl(var(--foreground) / 0.6)' }}>
              {data.job.title}
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              Candidate Comparison
            </span>
          </div>
          <Link href={`/dashboard/jobs/${jobId}`} className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem', textDecoration: 'none' }}>
            Back to Job Details
          </Link>
        </div>
      </header>

      {/* Body */}
      <main style={{ padding: '2rem 0' }}>
        <div className="container" style={{ maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
              Candidate Comparison Matrix
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)', margin: 0 }}>
              Comparing precomputed matching scores, requirement metrics, and grounded evidence side-by-side.
            </p>
          </div>

          {/* Side-by-Side Candidates Profile Card Header */}
          <div style={{ overflowX: 'auto' }} className="comparison-table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'hsl(var(--card))', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <th style={{ padding: '1.25rem', textAlign: 'left', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)', width: '220px' }}>
                    Criteria Metric
                  </th>
                  {data.candidates.map((cand) => (
                    <th key={cand.id} style={{ padding: '1.25rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))' }} className="compare-candidate-column">
                      <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>{cand.name}</h4>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                        <span className="badge badge-ai" style={{ fontSize: '0.675rem', textTransform: 'uppercase' }}>
                          {cand.status}
                        </span>
                        <Link href={`/dashboard/candidates/${cand.id}`} className="btn btn-secondary" style={{ fontSize: '0.675rem', padding: '0.15rem 0.4rem', textDecoration: 'none' }} id={`btn-view-profile-${cand.id}`}>
                          View Profile
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 1. Overall Match Score Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.1)' }}>
                  <td style={{ padding: '1rem', fontWeight: 700, fontSize: '0.925rem' }}>
                    Overall Match Score
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--accent))' }} className="compare-match-score">
                      {cand.match.finalScore}%
                    </td>
                  ))}
                </tr>

                {/* 2. Semantic Similarity Score Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                    Semantic Match (35%)
                    <div style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.4)', fontWeight: 600 }}>CONTRIBUTION</div>
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-semantic-score">
                      <div>{cand.match.semanticScore}%</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.125rem' }}>
                        ({cand.match.contributions.semantic} pts)
                      </div>
                    </td>
                  ))}
                </tr>

                {/* 3. Required Skills Match Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                    Required Skills (40%)
                    <div style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.4)', fontWeight: 600 }}>CONTRIBUTION</div>
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-required-score">
                      <div>{cand.match.requiredSkillsScore}%</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.125rem' }}>
                        ({cand.match.contributions.requiredSkills} pts)
                      </div>
                    </td>
                  ))}
                </tr>

                {/* 4. Preferred Skills Match Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                    Preferred Skills (15%)
                    <div style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.4)', fontWeight: 600 }}>CONTRIBUTION</div>
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-preferred-score">
                      <div>{cand.match.preferredSkillsScore}%</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.125rem' }}>
                        ({cand.match.contributions.preferredSkills} pts)
                      </div>
                    </td>
                  ))}
                </tr>

                {/* 5. Experience Score Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                    Experience Fit (10%)
                    <div style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.4)', fontWeight: 600 }}>CONTRIBUTION</div>
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-experience-score">
                      <div>{cand.match.experienceScore}%</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.125rem' }}>
                        ({cand.match.contributions.experience} pts)
                      </div>
                    </td>
                  ))}
                </tr>

                {/* 6. Experience Years & Level Row */}
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Experience Years
                  </td>
                  {data.candidates.map((cand) => (
                    <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-experience-years">
                      <strong>{cand.experience.years.toFixed(1)} years</strong>
                      <div style={{ fontSize: '0.75rem', color: cand.experience.alignment === 'Strong alignment' ? 'hsl(var(--success))' : 'hsl(var(--foreground) / 0.6)', marginTop: '0.25rem' }}>
                        {cand.experience.alignment}
                      </div>
                    </td>
                  ))}
                </tr>

                {/* 7. Skills Comparison Subtitle header */}
                <tr style={{ backgroundColor: 'hsl(var(--secondary) / 0.1)', borderBottom: '1px solid hsl(var(--border))' }}>
                  <td colSpan={data.candidates.length + 1} style={{ padding: '0.75rem 1.25rem', fontWeight: 700, fontSize: '0.875rem' }}>
                    Skills Coverage Matrix
                  </td>
                </tr>

                {/* Skill mapping rows */}
                {data.candidates[0].skills.map((skill, skillIdx) => (
                  <tr key={skillIdx} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }} className="compare-skill-name">
                      {skill.name}
                      <span className="badge" style={{ fontSize: '0.625rem', padding: '0.1rem 0.3rem', marginLeft: '0.5rem', backgroundColor: skill.category === 'required' ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--accent) / 0.1)', color: skill.category === 'required' ? 'hsl(var(--primary))' : 'hsl(var(--accent))' }}>
                        {skill.category}
                      </span>
                    </td>
                    {data.candidates.map((cand) => {
                      const candSkill = cand.skills[skillIdx];
                      return (
                        <td key={cand.id} style={{ padding: '1rem', textAlign: 'center', borderLeft: '1px solid hsl(var(--border))', fontSize: '0.875rem' }} className="compare-skill-status">
                          <span
                            className="badge"
                            style={{
                              backgroundColor: candSkill.status === 'CONFIRMED' ? 'hsl(var(--success) / 0.1)' : 'hsl(var(--foreground) / 0.08)',
                              color: candSkill.status === 'CONFIRMED' ? 'hsl(var(--success))' : 'hsl(var(--foreground) / 0.5)',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              display: 'inline-block'
                            }}
                          >
                            {candSkill.status === 'CONFIRMED' ? '✓ Confirmed' : '! Not Found'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI Summary Section */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              AI Factual Comparison Summary
            </h3>
            {data.aiSummary ? (
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'hsl(var(--foreground) / 0.8)', whiteSpace: 'pre-wrap', margin: 0 }} id="comparison-ai-summary-text">
                {data.aiSummary}
              </p>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)', fontStyle: 'italic', margin: 0 }} id="comparison-ai-summary-text">
                AI summary unavailable. Showing deterministic comparison results.
              </p>
            )}
          </div>

          {/* Grounded Evidence Providence Traces */}
          <div className="card" style={{ padding: '1.5rem' }} id="comparison-evidence-providence">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              Resume Grounded Evidence Providence
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.candidates.length}, 1fr)`, gap: '1rem' }}>
              {data.candidates.map((cand) => (
                <div key={cand.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-sm)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.925rem', fontWeight: 800, borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.375rem' }}>
                    {cand.name}
                  </h4>
                  {cand.skills.filter(s => s.status === 'CONFIRMED' && s.evidence).length > 0 ? (
                    cand.skills
                      .filter(s => s.status === 'CONFIRMED' && s.evidence)
                      .map((skill, idx) => (
                        <div key={idx} style={{ fontSize: '0.825rem' }}>
                          <span style={{ fontWeight: 600, display: 'block', color: 'hsl(var(--primary))' }}>
                            {skill.name}
                          </span>
                          <div style={{
                            marginTop: '0.25rem',
                            fontStyle: 'italic',
                            padding: '0.375rem',
                            borderRadius: '4px',
                            backgroundColor: 'hsl(var(--secondary) / 0.3)',
                            fontSize: '0.75rem',
                            lineHeight: 1.4
                          }}>
                            &quot;{skill.evidence}&quot;
                          </div>
                        </div>
                      ))
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.4)', margin: 0 }}>
                      No explicit text grounding available.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
