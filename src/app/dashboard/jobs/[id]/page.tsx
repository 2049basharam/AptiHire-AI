'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchJob = async () => {
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
    };

    fetchJob();
  }, [id]);

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
            TalentOS <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground) / 0.5)' }}>/ Job Details</span>
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

            {/* Description */}
            <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem' }}>
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
        </div>
      </main>
    </div>
  );
}
