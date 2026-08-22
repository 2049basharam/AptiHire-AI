'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CandidateResult {
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    createdAt: string;
  };
  match: {
    finalScore: number;
    candidateYears: number;
    semanticScore: number;
    requiredSkillsScore: number;
    preferredSkillsScore: number;
    experienceScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    matchedPreferred: string[];
    missingPreferred: string[];
    experienceStatus: string;
    grounding: Array<{
      requirement: string;
      status: 'Confirmed' | 'Partial' | 'Not Found' | 'Unknown';
      evidence: string;
    }>;
  };
}

interface SearchIntent {
  query?: string | null;
  skills?: string[] | null;
  requiredSkills?: string[] | null;
  preferredSkills?: string[] | null;
  minimumExperienceYears?: number | null;
  experienceLevel?: string | null;
  limit?: number | null;
}

function CandidateSearchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlSimilarCandidateId = searchParams.get('similarToCandidateId');
  const urlJobId = searchParams.get('jobId');

  const [query, setQuery] = useState('');
  const [similarCandidateId, setSimilarCandidateId] = useState<string | null>(urlSimilarCandidateId);
  const [similarCandidateName, setSimilarCandidateName] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(urlJobId);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [includeTerminal, setIncludeTerminal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [intent, setIntent] = useState<SearchIntent | null>(null);

  // If a similar candidate ID is provided, fetch candidate name for user context
  useEffect(() => {
    if (similarCandidateId) {
      fetch(`/api/candidates/${similarCandidateId}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Not found');
        })
        .then((data) => {
          if (data && data.firstName) {
            setSimilarCandidateName(`${data.firstName} ${data.lastName || ''}`);
          }
        })
        .catch(() => {
          setSimilarCandidateName(`Candidate #${similarCandidateId.substring(0, 8)}`);
        });
    } else {
      setSimilarCandidateName(null);
    }
  }, [similarCandidateId]);

  // If a Job ID is provided, fetch job title for user context
  useEffect(() => {
    if (jobId) {
      fetch(`/api/jobs/${jobId}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Not found');
        })
        .then((data) => {
          if (data && data.title) {
            setJobTitle(data.title);
          }
        })
        .catch(() => {
          setJobTitle(`Job Opening #${jobId.substring(0, 8)}`);
        });
    } else {
      setJobTitle(null);
    }
  }, [jobId]);

  // Trigger search on mount if initial parameters exist
  useEffect(() => {
    if (urlSimilarCandidateId || urlJobId) {
      handleSearch(null, urlSimilarCandidateId, urlJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSimilarCandidateId, urlJobId]);

  const handleSearch = async (
    e: React.FormEvent | null,
    forceSimilarId?: string | null,
    forceJobId?: string | null
  ) => {
    if (e) e.preventDefault();

    const targetSimilarId = forceSimilarId !== undefined ? forceSimilarId : similarCandidateId;
    const targetJobId = forceJobId !== undefined ? forceJobId : jobId;

    if (!query.trim() && !targetSimilarId) {
      setError('Please provide a search query or similarity candidate target.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setIntent(null);

    try {
      const response = await fetch('/api/candidates/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim() || undefined,
          jobId: targetJobId || undefined,
          similarToCandidateId: targetSimilarId || undefined,
          includeTerminal,
          limit: 20,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to execute natural language search query.');
      }

      setResults(data.candidates || []);
      setIntent(data.intent || null);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred during search.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSimilarityConstraint = () => {
    setSimilarCandidateId(null);
    setSimilarCandidateName(null);
    router.replace('/dashboard/search');
  };

  const clearJobConstraint = () => {
    setJobId(null);
    setJobTitle(null);
    router.replace('/dashboard/search');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Link href="/dashboard" style={{ fontWeight: 800, fontSize: '1.25rem', textDecoration: 'none', color: 'hsl(var(--foreground))' }}>
              Apti<span style={{ color: 'hsl(var(--primary))' }}>Hire</span> AI
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              Candidate Discovery Search
            </span>
          </div>
          <Link href="/dashboard" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2.5rem 0' }}>
        <div className="container" style={{ maxWidth: '950px' }}>
          
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-ai">Natural-Language Discovery</span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Candidate Discovery Search</h1>
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.65)' }}>
              Find candidate matches using natural language queries powered by pgvector hybrid semantic search.
            </p>
          </div>

          {/* Search Controls Card */}
          <div className="card" style={{ marginBottom: '1.75rem', padding: '1.5rem', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }}>
            <form onSubmit={(e) => handleSearch(e)}>
              {similarCandidateId && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.6rem 0.85rem', 
                  backgroundColor: 'rgba(37, 99, 235, 0.08)', 
                  border: '1px solid rgba(37, 99, 235, 0.25)', 
                  color: 'hsl(var(--primary))', 
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '1.25rem'
                }} id="similarity-context-banner">
                  <span>
                    🔍 Finding candidate profiles similar to: <strong>{similarCandidateName || 'Loading...'}</strong>
                  </span>
                  <button 
                    type="button" 
                    onClick={clearSimilarityConstraint}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              {jobId && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.6rem 0.85rem', 
                  backgroundColor: 'rgba(16, 185, 129, 0.08)', 
                  border: '1px solid rgba(16, 185, 129, 0.25)', 
                  color: 'hsl(var(--success))', 
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '1.25rem'
                }} id="job-context-banner">
                  <span>
                    💼 Scoring candidates tailored to Job Context: <strong>{jobTitle || 'Loading...'}</strong>
                  </span>
                  <button 
                    type="button" 
                    onClick={clearJobConstraint}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.85rem' }}>
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={similarCandidateId ? 'Refine search constraints (optional)...' : 'e.g. Find Senior React & Node.js engineers with 5+ years experience...'}
                  style={{ 
                    flex: 1, 
                    padding: '0.8rem 1.1rem', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid hsl(var(--border))', 
                    backgroundColor: 'hsl(var(--card))',
                    fontSize: '0.95rem'
                  }}
                  className="form-input"
                  id="search-input-field"
                />
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isLoading}
                  style={{ padding: '0.8rem 1.75rem', fontWeight: 700, borderRadius: 'var(--radius-md)' }}
                  id="btn-execute-search"
                >
                  {isLoading ? 'Searching...' : 'Run Search'}
                </button>
              </div>

              <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="include-terminal-checkbox" 
                  checked={includeTerminal}
                  onChange={(e) => setIncludeTerminal(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="include-terminal-checkbox" style={{ fontSize: '0.85rem', color: 'hsl(var(--foreground) / 0.65)', cursor: 'pointer', fontWeight: 500 }}>
                  Include terminal candidates (Rejected or Withdrawn profiles)
                </label>
              </div>
            </form>
          </div>

          {error && (
            <div style={{ 
              padding: '1rem 1.25rem', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              color: 'hsl(var(--danger))', 
              border: '1px solid rgba(239, 68, 68, 0.25)', 
              borderRadius: 'var(--radius-md)', 
              marginBottom: '1.75rem',
              fontSize: '0.9rem',
              fontWeight: 500
            }} id="search-error-banner">
              ⚠️ {error}
            </div>
          )}

          {/* AI Query Interpretation */}
          {intent && (
            <div className="card" style={{ marginBottom: '1.75rem', border: '1px dashed hsl(var(--ai-accent))', backgroundColor: 'rgba(139, 92, 246, 0.04)', borderRadius: '14px', padding: '1.25rem' }} id="ai-interpretation-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1rem' }}>✨</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--ai-accent))', margin: 0 }}>
                  AptiHire Extracted Intent:
                </h3>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <strong style={{ display: 'block', color: 'hsl(var(--foreground) / 0.55)', textTransform: 'uppercase', fontSize: '0.725rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
                    Required Skills
                  </strong>
                  <span id="interpreted-required-skills" style={{ fontWeight: 600 }}>
                    {intent.requiredSkills && intent.requiredSkills.length > 0 
                      ? intent.requiredSkills.join(', ') 
                      : intent.skills && intent.skills.length > 0 
                        ? intent.skills.join(', ')
                        : 'None specified'}
                  </span>
                </div>

                <div>
                  <strong style={{ display: 'block', color: 'hsl(var(--foreground) / 0.55)', textTransform: 'uppercase', fontSize: '0.725rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
                    Preferred Skills
                  </strong>
                  <span id="interpreted-preferred-skills" style={{ fontWeight: 600 }}>
                    {intent.preferredSkills && intent.preferredSkills.length > 0 
                      ? intent.preferredSkills.join(', ') 
                      : 'None specified'}
                  </span>
                </div>

                <div>
                  <strong style={{ display: 'block', color: 'hsl(var(--foreground) / 0.55)', textTransform: 'uppercase', fontSize: '0.725rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
                    Min Experience
                  </strong>
                  <span id="interpreted-experience" style={{ fontWeight: 600 }}>
                    {intent.minimumExperienceYears !== null && intent.minimumExperienceYears !== undefined
                      ? `${intent.minimumExperienceYears}+ years`
                      : intent.experienceLevel
                        ? `${intent.experienceLevel} Tier`
                        : 'Any experience'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Results List */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'hsl(var(--foreground) / 0.6)' }}>
              <div className="pulse-indicator" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
              <p style={{ fontWeight: 600 }}>Searching semantic vector database...</p>
            </div>
          ) : results.length === 0 && intent ? (
            <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', borderRadius: '16px' }} id="search-empty-state">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'hsl(var(--foreground))' }}>
                No Matching Candidates Found
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.65)', maxWidth: '460px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                {"We couldn't retrieve candidates matching all extracted filters. Try the following adjustments:"}
              </p>
              <ul style={{ 
                textAlign: 'left', 
                maxWidth: '420px', 
                margin: '0 auto', 
                fontSize: '0.85rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.65rem',
                color: 'hsl(var(--foreground) / 0.8)'
              }}>
                <li>💡 Broaden your query statement by focusing on core technical skills.</li>
                <li>{"💡 Try searching for general role titles (e.g. \"Full Stack Developer\")."}</li>
                <li>💡 If similarity search is active, clear the similarity constraint and search directly.</li>
                <li>💡 Confirm candidate resumes are uploaded and approved in the Candidates workspace.</li>
              </ul>
            </div>
          ) : results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} id="search-results-list">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.65)' }}>
                  Retrieved <strong style={{ color: 'hsl(var(--foreground))' }}>{results.length}</strong> candidate match{results.length === 1 ? '' : 'es'}
                </span>
              </div>

              {results.map(({ candidate, match }) => {
                const displayName = candidate.firstName && candidate.lastName
                  ? `${candidate.firstName} ${candidate.lastName}`
                  : `Candidate #${candidate.id.substring(0, 8)}`;

                return (
                  <div key={candidate.id} className="card search-candidate-card" style={{ border: '1px solid hsl(var(--border))', padding: '1.5rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1rem' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 800 }} className="candidate-name">
                          {displayName}
                        </h4>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.85rem', color: 'hsl(var(--foreground) / 0.65)' }}>
                          <span>Experience: <strong>{match.candidateYears.toFixed(1)} years</strong></span>
                          <span>•</span>
                          <span className={`badge ${
                            candidate.status === 'SHORTLISTED' ? 'badge-success' :
                            candidate.status === 'REJECTED' ? 'badge-danger' : 'badge-primary'
                          }`} style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            {candidate.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--primary))', lineHeight: 1 }} className="relevance-score">
                          {match.finalScore}%
                        </div>
                        <span style={{ fontSize: '0.675rem', color: 'hsl(var(--foreground) / 0.5)', textTransform: 'uppercase', fontWeight: 700, marginTop: '0.2rem' }}>
                          Match Relevance
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
                      {match.matchedSkills.map((skill) => (
                        <span key={skill} className="badge badge-success">
                          ✓ {skill}
                        </span>
                      ))}
                      {match.missingSkills.map((skill) => (
                        <span key={skill} className="badge badge-secondary" style={{ opacity: 0.7 }}>
                          Missing: {skill}
                        </span>
                      ))}
                    </div>

                    {/* Collapsible Evidence Grounding Section */}
                    <details style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '0.85rem' }}>
                      <summary style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--primary))', cursor: 'pointer', outline: 'none' }}>
                        View Grounded Match Evidence ({match.grounding.length} requirement checks)
                      </summary>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.85rem' }}>
                        {match.grounding.map((item) => (
                          <div key={item.requirement} style={{ padding: '0.75rem 1rem', backgroundColor: 'hsl(var(--secondary) / 0.5)', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                              <strong style={{ color: 'hsl(var(--foreground))' }}>{item.requirement}</strong>
                              <span className={item.status === 'Confirmed' ? 'badge badge-success' : 'badge badge-secondary'} style={{ fontSize: '0.7rem' }}>
                                {item.status}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.825rem', color: 'hsl(var(--foreground) / 0.75)', fontStyle: 'italic', lineHeight: 1.45 }}>
                              {"\""}{item.evidence}{"\""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '0.85rem' }}>
                      <Link href={`/dashboard/candidates/${candidate.id}`} className="btn btn-secondary" style={{ fontSize: '0.825rem', padding: '0.35rem 0.85rem' }}>
                        View Candidate Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '5rem 0', color: 'hsl(var(--foreground) / 0.45)' }}>
              Enter a search statement to discover candidate matches.
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default function CandidateSearchPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '4rem', color: 'hsl(var(--foreground) / 0.6)' }}>Loading candidate search portal...</div>}>
      <CandidateSearchInner />
    </Suspense>
  );
}
