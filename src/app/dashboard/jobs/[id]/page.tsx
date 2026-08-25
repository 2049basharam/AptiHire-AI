'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MatchDetailModal from './MatchDetailModal';

interface PipelineCandidate {
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
    createdAt: string;
    updatedAt: string;
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
    skillGroundingMap: Record<string, string>;
  };
}

interface Job {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  requirements: {
    experienceLevel?: 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | null;
    skills: string[];
    responsibilities: string[];
    qualifications: string[];
  } | null;
  createdAt: string;
}

interface MatchedCandidate {
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
  };
  match: {
    finalScore: number;
    experienceStatus: string;
    matchedSkills: string[];
    missingSkills: string[];
  };
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Rebranding tab & candidates match states
  const [activeTab, setActiveTab] = useState<'specs' | 'matches' | 'pipeline'>('specs');
  const [matches, setMatches] = useState<MatchedCandidate[]>([]);
  const [matchesSearch, setMatchesSearch] = useState('');
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [errorMatches, setErrorMatches] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<{ id: string; name: string } | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  // Pipeline state variables
  const [pipelineCandidates, setPipelineCandidates] = useState<PipelineCandidate[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [errorPipeline, setErrorPipeline] = useState<string | null>(null);

  // Pipeline Filter states
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineMinScore, setPipelineMinScore] = useState('');

  const fetchJob = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to retrieve job details.');
      }
      setJob(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMatches = useCallback(async (searchQuery?: string) => {
    setLoadingMatches(true);
    setErrorMatches(null);
    try {
      let res;
      if (searchQuery) {
        res = await fetch(`/api/candidates/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery,
            jobId: id,
            limit: 50,
          }),
        });
      } else {
        res = await fetch(`/api/jobs/${id}/candidates`);
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to retrieve matches.');
      }
      setMatches(data.candidates || []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setErrorMatches(errMsg);
    } finally {
      setLoadingMatches(false);
    }
  }, [id]);

  const fetchPipeline = useCallback(async () => {
    setLoadingPipeline(true);
    setErrorPipeline(null);
    try {
      console.log('client: fetchPipeline starting for job id:', id);
      const url = new URL(`/api/jobs/${id}/pipeline`, window.location.origin);
      if (pipelineSearch) url.searchParams.set('search', pipelineSearch);
      if (pipelineMinScore) url.searchParams.set('minScore', pipelineMinScore);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      console.log('client: fetchPipeline response count:', data ? data.length : 0);
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to retrieve pipeline candidates.');
      }
      setPipelineCandidates(data || []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('client: fetchPipeline error:', errMsg);
      setErrorPipeline(errMsg);
    } finally {
      setLoadingPipeline(false);
    }
  }, [id, pipelineSearch, pipelineMinScore]);

  useEffect(() => {
    fetchJob();
  }, [id, fetchJob]);

  useEffect(() => {
    if (activeTab === 'matches') {
      fetchMatches();
    }
  }, [activeTab, id, fetchMatches]);

  useEffect(() => {
    if (activeTab === 'pipeline') {
      fetchPipeline();
    }
  }, [activeTab, id, fetchPipeline]);

  // Update status (Publish or Archive)
  const handleUpdateStatus = async (nextStatus: 'PUBLISHED' | 'ARCHIVED') => {
    setUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update job status.');
      }

      setJob(data);
      setSuccess(`Job successfully ${nextStatus.toLowerCase()}!`);
      router.refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))' }}>
        <div>Loading job details...</div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ color: 'hsl(var(--danger))', fontWeight: 600, marginBottom: '1rem' }}>Error</div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>{error}</p>
          <Link href="/dashboard/jobs" className="btn btn-secondary">Back to Jobs</Link>
        </div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>
            AptiHire AI <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground) / 0.5)' }}>/ Job Details</span>
          </div>
          <Link href="/dashboard/jobs" className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
            Back to Jobs
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          {success && (
            <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--success) / 0.15)', color: 'hsl(var(--success))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid hsl(var(--success) / 0.2)' }}>
              {success}
            </div>
          )}

          {error && (
            <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid hsl(var(--danger) / 0.2)' }}>
              {error}
            </div>
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Title & Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>{job.title}</h1>
                <span className={`badge ${job.status === 'PUBLISHED' ? 'badge-success' : job.status === 'ARCHIVED' ? 'badge-ai' : 'badge-secondary'}`} style={{ textTransform: 'uppercase' }}>
                  {job.status}
                </span>
              </div>
              
              {/* Status transition action controls */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {job.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus('PUBLISHED')}
                      className="btn btn-primary"
                      disabled={updating}
                      style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
                      id="btn-publish-job"
                    >
                      {updating ? 'Publishing...' : 'Publish Job'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('ARCHIVED')}
                      className="btn btn-secondary"
                      disabled={updating}
                      style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem', color: 'hsl(var(--danger))' }}
                    >
                      Archive Job
                    </button>
                  </>
                )}

                {job.status === 'PUBLISHED' && (
                  <button
                    onClick={() => handleUpdateStatus('ARCHIVED')}
                    className="btn btn-secondary"
                    disabled={updating}
                    style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem', color: 'hsl(var(--danger))' }}
                  >
                    Archive Job
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <button
                onClick={() => setActiveTab('specs')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.925rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'specs' ? 'hsl(var(--accent))' : 'hsl(var(--foreground) / 0.6)',
                  borderBottom: activeTab === 'specs' ? '2px solid hsl(var(--accent))' : 'none',
                  paddingBottom: '0.25rem',
                }}
                id="tab-specs"
              >
                Job Specifications
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.925rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'matches' ? 'hsl(var(--accent))' : 'hsl(var(--foreground) / 0.6)',
                  borderBottom: activeTab === 'matches' ? '2px solid hsl(var(--accent))' : 'none',
                  paddingBottom: '0.25rem',
                }}
                id="tab-matches"
              >
                Candidate Matches
              </button>
              <button
                onClick={() => setActiveTab('pipeline')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.925rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'pipeline' ? 'hsl(var(--accent))' : 'hsl(var(--foreground) / 0.6)',
                  borderBottom: activeTab === 'pipeline' ? '2px solid hsl(var(--accent))' : 'none',
                  paddingBottom: '0.25rem',
                }}
                id="tab-pipeline"
              >
                Hiring Pipeline
              </button>
            </div>

            {/* TAB CONTENT: Specs */}
            {activeTab === 'specs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Description */}
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Job Description</h3>
                  <p style={{ fontSize: '0.925rem', color: 'hsl(var(--foreground) / 0.8)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {job.description}
                  </p>
                </div>

                {/* Requirements section */}
                <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Structured Candidate Requirements</h3>

                  {!job.requirements ? (
                    <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No structured requirements configured for this job opening.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Experience Level */}
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>
                          Experience Level
                        </span>
                        <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                          {job.requirements.experienceLevel || 'Not Specified'}
                        </span>
                      </div>

                      {/* Skills tags */}
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600, marginBottom: '0.5rem' }}>
                          Required Skills
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {job.requirements.skills.length === 0 ? (
                            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>None configured.</span>
                          ) : (
                            job.requirements.skills.map((skill, i) => (
                              <span key={i} className="badge badge-secondary">{skill}</span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Responsibilities list */}
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600, marginBottom: '0.5rem' }}>
                          Responsibilities
                        </span>
                        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                          {job.requirements.responsibilities.length === 0 ? (
                            <li style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>None configured.</li>
                          ) : (
                            job.requirements.responsibilities.map((resp, i) => (
                              <li key={i} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{resp}</li>
                            ))
                          )}
                        </ul>
                      </div>

                      {/* Qualifications list */}
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600, marginBottom: '0.5rem' }}>
                          Qualifications
                        </span>
                        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                          {job.requirements.qualifications.length === 0 ? (
                            <li style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>None configured.</li>
                          ) : (
                            job.requirements.qualifications.map((qual, i) => (
                              <li key={i} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{qual}</li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Matches */}
            {activeTab === 'matches' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Semantic Match Search Input */}
                <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder="Search candidate pool semantically for this job (e.g. strong candidates with PostgreSQL)..." 
                    value={matchesSearch}
                    onChange={(e) => setMatchesSearch(e.target.value)}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--input))', fontSize: '0.875rem' }}
                    id="job-matches-search-input"
                  />
                  <button 
                    onClick={() => fetchMatches(matchesSearch)}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    id="btn-job-matches-search"
                  >
                    Search
                  </button>
                  {matchesSearch && (
                    <button 
                      onClick={() => { setMatchesSearch(''); fetchMatches(); }}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                      id="btn-clear-job-matches-search"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {loadingMatches ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.925rem' }}>Loading candidate semantic matches...</div>
                ) : errorMatches ? (
                  <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                    {errorMatches}
                  </div>
                ) : matches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0', color: 'hsl(var(--foreground) / 0.5)' }}>
                    <p style={{ margin: '0 0 1rem 0' }}>No eligible candidate matches found for this job opening.</p>
                    <p style={{ fontSize: '0.825rem', maxWidth: '400px', margin: '0 auto' }}>
                      Ensure candidates are uploaded, parsed, and approved under the Candidates panel to make them eligible for matching.
                    </p>
                  </div>
                                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Selection Context Bar */}
                    <div 
                      className="card" 
                      style={{ 
                        padding: '0.75rem 1rem', 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        borderRadius: 'var(--radius-md)'
                      }} 
                      id="comparison-selection-bar"
                    >
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {selectedCandidates.length === 5 ? (
                          <span style={{ color: 'hsl(var(--accent))' }} id="selection-status-text">5 selected. Maximum reached</span>
                        ) : (
                          <span id="selection-status-text">{selectedCandidates.length} candidate{selectedCandidates.length === 1 ? '' : 's'} selected</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link
                          href={selectedCandidates.length >= 2 ? `/dashboard/jobs/${id}/compare?candidates=${selectedCandidates.join(',')}` : '#'}
                          className={`btn btn-primary ${selectedCandidates.length < 2 ? 'disabled' : ''}`}
                          style={{ 
                            fontSize: '0.875rem', 
                            padding: '0.4rem 0.8rem', 
                            textDecoration: 'none',
                            pointerEvents: selectedCandidates.length < 2 ? 'none' : 'auto',
                            opacity: selectedCandidates.length < 2 ? 0.5 : 1
                          }}
                          id="btn-compare-candidates"
                        >
                          Compare Candidates
                        </Link>
                        {selectedCandidates.length > 0 && (
                          <button
                            onClick={() => setSelectedCandidates([])}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.875rem', padding: '0.4rem 0.8rem' }}
                            id="btn-clear-selection"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} id="ranked-matches-list">
                      {matches.map(({ candidate, match }) => (
                        <div 
                          key={candidate.id} 
                          className="card candidate-match-card" 
                          style={{ 
                            padding: '1rem', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            gap: '1.5rem', 
                            border: '1px solid hsl(var(--border))',
                            backgroundColor: selectedCandidates.includes(candidate.id) ? 'hsl(var(--secondary) / 0.1)' : 'hsl(var(--card))'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={selectedCandidates.includes(candidate.id)}
                              disabled={!selectedCandidates.includes(candidate.id) && selectedCandidates.length >= 5}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (selectedCandidates.length < 5) {
                                    setSelectedCandidates([...selectedCandidates, candidate.id]);
                                  }
                                } else {
                                  setSelectedCandidates(selectedCandidates.filter(cid => cid !== candidate.id));
                                }
                              }}
                              style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                              id={`select-candidate-${candidate.id}`}
                              className="compare-select-checkbox"
                            />
                            
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }} className="candidate-name">
                                  {candidate.firstName && candidate.lastName
                                    ? `${candidate.firstName} ${candidate.lastName}`
                                    : `Candidate #${candidate.id.substring(0, 8)}`}
                                </h4>
                                <span className={`badge ${
                                  candidate.status === 'SHORTLISTED' ? 'badge-success' :
                                  candidate.status === 'REJECTED' ? 'badge-secondary' : 'badge-ai'
                                }`} style={{ textTransform: 'uppercase', fontSize: '0.675rem', padding: '0.2rem 0.5rem' }}>
                                  {candidate.status}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.825rem', marginTop: '0.25rem' }}>
                                <span style={{ color: 'hsl(var(--foreground) / 0.6)' }}>
                                  Experience: <strong>{match.experienceStatus}</strong>
                                </span>
                              </div>

                              {/* Skill coverage overview */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.25rem' }}>
                                {match.matchedSkills.slice(0, 4).map((skill, index) => (
                                  <span key={index} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', backgroundColor: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))', borderRadius: '4px', fontWeight: 600 }}>
                                    ✓ {skill}
                                  </span>
                                ))}
                                {match.missingSkills.slice(0, 2).map((skill, index) => (
                                  <span key={index} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', backgroundColor: 'hsl(var(--danger) / 0.08)', color: 'hsl(var(--danger))', borderRadius: '4px' }}>
                                    ! {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Match Score & View button */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'hsl(var(--accent))' }} className="match-score">
                              {match.finalScore}%
                            </div>
                            <button
                              onClick={() => setSelectedCandidate({
                                id: candidate.id,
                                name: candidate.firstName && candidate.lastName
                                  ? `${candidate.firstName} ${candidate.lastName}`
                                  : `Candidate #${candidate.id.substring(0, 8)}`
                              })}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.825rem', padding: '0.3rem 0.6rem' }}
                              id={`btn-view-analysis-${candidate.id}`}
                            >
                              View Analysis
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Pipeline */}
            {activeTab === 'pipeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Search & Filters */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                      type="text"
                      placeholder="Search candidates by name or email..."
                      value={pipelineSearch}
                      onChange={(e) => setPipelineSearch(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: '0.875rem' }}
                      id="pipeline-search-input"
                    />
                  </div>
                  <div style={{ minWidth: '150px' }}>
                    <select
                      value={pipelineMinScore}
                      onChange={(e) => setPipelineMinScore(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: '0.875rem' }}
                      id="pipeline-score-filter"
                    >
                      <option value="">All Match Scores</option>
                      <option value="90">&ge; 90% Match</option>
                      <option value="80">&ge; 80% Match</option>
                      <option value="70">&ge; 70% Match</option>
                      <option value="50">&ge; 50% Match</option>
                    </select>
                  </div>
                </div>

                {/* Pipeline Stats Summary Banner */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: 'hsl(var(--card))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', justifyContent: 'space-around', fontSize: '0.825rem' }}>
                  <div>APPROVED: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'APPROVED').length}</strong></div>
                  <div>SHORTLISTED: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'SHORTLISTED').length}</strong></div>
                  <div>SCREENING: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'SCREENING').length}</strong></div>
                  <div>INTERVIEW: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'INTERVIEW').length}</strong></div>
                  <div>OFFER: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'OFFER').length}</strong></div>
                  <div>HIRED: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'HIRED').length}</strong></div>
                  <div style={{ color: 'hsl(var(--danger))' }}>REJECTED: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'REJECTED').length}</strong></div>
                  <div style={{ color: 'hsl(var(--foreground) / 0.5)' }}>WITHDRAWN: <strong>{pipelineCandidates.filter(c => c.candidate.status === 'WITHDRAWN').length}</strong></div>
                </div>

                {loadingPipeline ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.925rem' }}>Loading pipeline board...</div>
                ) : errorPipeline ? (
                  <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                    {errorPipeline}
                  </div>
                ) : (
                  /* Kanban Board Layout */
                  <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem' }} id="kanban-pipeline-board">
                    {[
                      { key: 'APPROVED', label: 'Approved' },
                      { key: 'SHORTLISTED', label: 'Shortlisted' },
                      { key: 'SCREENING', label: 'Screening' },
                      { key: 'INTERVIEW', label: 'Interview' },
                      { key: 'OFFER', label: 'Offer' },
                      { key: 'HIRED', label: 'Hired' }
                    ].map((stage) => {
                      const stageCandidates = pipelineCandidates.filter(c => c.candidate.status === stage.key);
                      return (
                        <div key={stage.key} style={{ minWidth: '220px', width: '220px', flexShrink: 0, backgroundColor: 'hsl(var(--card) / 0.4)', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
                          {/* Column Header */}
                          <div style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'hsl(var(--card))', borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{stage.label}</span>
                            <span className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem' }}>{stageCandidates.length}</span>
                          </div>

                          {/* Column Cards Body */}
                          <div style={{ padding: '0.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }} className={`kanban-col-${stage.key.toLowerCase()}`}>
                            {stageCandidates.length === 0 ? (
                              <div style={{ padding: '2rem 0', textAlign: 'center', fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.4)', border: '2px dashed hsl(var(--border))', borderRadius: 'var(--radius-sm)' }}>
                                Empty Column
                              </div>
                            ) : (
                              stageCandidates.map((item) => (
                                <div
                                  key={item.candidate.id}
                                  className="card kanban-candidate-card"
                                  style={{ padding: '0.75rem', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}
                                  onClick={() => setSelectedCandidate({
                                    id: item.candidate.id,
                                    name: item.candidate.firstName && item.candidate.lastName
                                      ? `${item.candidate.firstName} ${item.candidate.lastName}`
                                      : `Candidate #${item.candidate.id.substring(0, 8)}`
                                  })}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.825rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} className="kanban-cand-name">
                                      {item.candidate.firstName && item.candidate.lastName
                                        ? `${item.candidate.firstName} ${item.candidate.lastName}`
                                        : `Candidate #${item.candidate.id.substring(0, 8)}`}
                                    </span>
                                    <span style={{ fontSize: '0.825rem', fontWeight: 800, color: 'hsl(var(--accent))' }}>
                                      {item.match.finalScore}%
                                    </span>
                                  </div>
                                  
                                  {/* Last Activity / Updated Time */}
                                  <span style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.4)' }}>
                                    Updated: {new Date(item.candidate.updatedAt).toLocaleDateString()}
                                  </span>

                                  {/* Key Matched Skills */}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                                    {item.match.matchedSkills.slice(0, 2).map((skill: string, idx: number) => (
                                      <span key={idx} style={{ fontSize: '0.675rem', padding: '0.1rem 0.3rem', backgroundColor: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))', borderRadius: '2px', fontWeight: 600 }}>
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Match Detail Dialog */}
      {selectedCandidate && (
        <MatchDetailModal
          isOpen={true}
          onClose={() => setSelectedCandidate(null)}
          jobId={job.id}
          candidateId={selectedCandidate.id}
          candidateName={selectedCandidate.name}
          onStatusUpdated={() => {
            console.log('client: onStatusUpdated triggered, calling fetchMatches and fetchPipeline');
            fetchMatches();
            fetchPipeline();
          }}
        />
      )}
    </div>
  );
}
