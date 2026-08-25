'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Requirements {
  experienceLevel: 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | null;
  skills: string[];
  responsibilities: string[];
  qualifications: string[];
}

export default function CreateJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Requirements state
  const [requirements, setRequirements] = useState<Requirements>({
    experienceLevel: 'MID',
    skills: [],
    responsibilities: [],
    qualifications: [],
  });

  // State to track if requirements have been extracted or entered
  const [hasRequirements, setHasRequirements] = useState(false);
  const [isAiGenerated, setIsAiGenerated] = useState(false);

  // Async process statuses
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Temp item inputs for manual edits
  const [newSkill, setNewSkill] = useState('');
  const [newResp, setNewResp] = useState('');
  const [newQual, setNewQual] = useState('');

  // 1. Trigger AI-assisted requirements extraction
  const handleAiExtract = async () => {
    if (!description.trim()) {
      setExtractionError('Please provide a job description first.');
      return;
    }

    setExtracting(true);
    setExtractionError(null);

    try {
      const res = await fetch('/api/jobs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to extract requirements.');
      }

      setRequirements({
        experienceLevel: data.experienceLevel || 'MID',
        skills: data.skills || [],
        responsibilities: data.responsibilities || [],
        qualifications: data.qualifications || [],
      });
      setHasRequirements(true);
      setIsAiGenerated(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setExtractionError(errMsg || 'AI extraction is currently unavailable. You can enter requirements manually.');
      // Enable manual entry automatically on failure
      setHasRequirements(true);
      setIsAiGenerated(false);
    } finally {
      setExtracting(false);
    }
  };

  // 2. Enable manual requirements entry directly
  const handleManualEntry = () => {
    setHasRequirements(true);
    setIsAiGenerated(false);
    setExtractionError(null);
  };

  // List manipulation helpers
  const addSkill = () => {
    if (newSkill.trim() && !requirements.skills.includes(newSkill.trim())) {
      setRequirements({ ...requirements, skills: [...requirements.skills, newSkill.trim()] });
      setNewSkill('');
    }
  };

  const removeSkill = (index: number) => {
    const updated = requirements.skills.filter((_, i) => i !== index);
    setRequirements({ ...requirements, skills: updated });
  };

  const addResp = () => {
    if (newResp.trim() && !requirements.responsibilities.includes(newResp.trim())) {
      setRequirements({ ...requirements, responsibilities: [...requirements.responsibilities, newResp.trim()] });
      setNewResp('');
    }
  };

  const removeResp = (index: number) => {
    const updated = requirements.responsibilities.filter((_, i) => i !== index);
    setRequirements({ ...requirements, responsibilities: updated });
  };

  const addQual = () => {
    if (newQual.trim() && !requirements.qualifications.includes(newQual.trim())) {
      setRequirements({ ...requirements, qualifications: [...requirements.qualifications, newQual.trim()] });
      setNewQual('');
    }
  };

  const removeQual = (index: number) => {
    const updated = requirements.qualifications.filter((_, i) => i !== index);
    setRequirements({ ...requirements, qualifications: updated });
  };

  // 3. Save Job Draft
  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        title,
        description,
        requirements: hasRequirements ? requirements : null,
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to save job opening.');
      }

      router.push('/dashboard/jobs');
      router.refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>
            AptiHire AI <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground) / 0.5)' }}>/ Create Job</span>
          </div>
          <Link href="/dashboard/jobs" className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
            Cancel
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <form onSubmit={handleSaveJob} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>New Job Opening</h2>

            {error && (
              <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', border: '1px solid hsl(var(--danger) / 0.2)' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="title">Job Title</label>
              <input
                id="title"
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={loading || extracting}
                placeholder="e.g. Senior Software Engineer (Node.js)"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">Job Description</label>
              <textarea
                id="description"
                className="form-input"
                style={{ minHeight: '150px', resize: 'vertical' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={loading || extracting}
                placeholder="Paste the full job details here..."
              />
            </div>

            {/* AI Extraction trigger panel */}
            {!hasRequirements && (
              <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Structured Requirements</h3>
                <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>
                  Extract candidate parameters (skills, experience level) using AI, or fill them in manually.
                </p>
                {extractionError && (
                  <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', border: '1px solid hsl(var(--danger) / 0.2)' }}>
                    {extractionError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    className="btn btn-primary"
                    disabled={extracting || loading || !description.trim()}
                  >
                    {extracting ? 'Extracting via AI...' : '⚡ Extract via AI'}
                  </button>
                  <button
                    type="button"
                    onClick={handleManualEntry}
                    className="btn btn-secondary"
                    disabled={extracting || loading}
                  >
                    Enter Manually
                  </button>
                </div>
              </div>
            )}

            {/* Interactive requirements review panel */}
            {hasRequirements && (
              <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Structured Requirements</h3>
                  {isAiGenerated && <span className="badge badge-ai">[AI-Generated]</span>}
                </div>

                {extractionError && (
                  <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', border: '1px solid hsl(var(--danger) / 0.2)' }}>
                    {extractionError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="experienceLevel">Experience Level</label>
                  <select
                    id="experienceLevel"
                    className="form-input"
                    value={requirements.experienceLevel || ''}
                    onChange={(e) => setRequirements({ ...requirements, experienceLevel: (e.target.value || null) as Requirements['experienceLevel'] })}
                    disabled={loading}
                  >
                    <option value="">Not Specified</option>
                    <option value="ENTRY">Entry Level</option>
                    <option value="MID">Mid Level</option>
                    <option value="SENIOR">Senior Level</option>
                    <option value="LEAD">Lead Level</option>
                  </select>
                </div>

                {/* Skills array review */}
                <div className="form-group">
                  <label className="form-label">Required Skills</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      placeholder="Add a skill (e.g. React)"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                    />
                    <button type="button" onClick={addSkill} className="btn btn-secondary">Add</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {requirements.skills.length === 0 && <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No skills added.</span>}
                    {requirements.skills.map((skill, index) => (
                      <span key={index} className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {skill}
                        <button type="button" onClick={() => removeSkill(index)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--danger))', padding: '0 0.125rem' }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Responsibilities array review */}
                <div className="form-group">
                  <label className="form-label">Responsibilities</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newResp}
                      onChange={(e) => setNewResp(e.target.value)}
                      placeholder="Add a responsibility"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addResp(); } }}
                    />
                    <button type="button" onClick={addResp} className="btn btn-secondary">Add</button>
                  </div>
                  <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                    {requirements.responsibilities.length === 0 && <li style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No responsibilities added.</li>}
                    {requirements.responsibilities.map((resp, index) => (
                      <li key={index} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {resp}
                          <button type="button" onClick={() => removeResp(index)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--danger))', fontSize: '0.875rem' }}>Remove</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Qualifications array review */}
                <div className="form-group">
                  <label className="form-label">Qualifications</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newQual}
                      onChange={(e) => setNewQual(e.target.value)}
                      placeholder="Add a qualification (e.g. BS in CS)"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQual(); } }}
                    />
                    <button type="button" onClick={addQual} className="btn btn-secondary">Add</button>
                  </div>
                  <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                    {requirements.qualifications.length === 0 && <li style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No qualifications added.</li>}
                    {requirements.qualifications.map((qual, index) => (
                      <li key={index} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {qual}
                          <button type="button" onClick={() => removeQual(index)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--danger))', fontSize: '0.875rem' }}>Remove</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start', marginTop: '1.5rem', padding: '0.75rem 2rem' }}
              disabled={loading || extracting}
            >
              {loading ? 'Saving Job Opening...' : 'Save Job Opening'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
