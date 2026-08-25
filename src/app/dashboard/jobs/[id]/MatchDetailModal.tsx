'use client';

import { useState, useEffect, useCallback } from 'react';

interface MatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  candidateId: string;
  candidateName: string;
  onStatusUpdated: (newStatus: string) => void;
}

interface MatchDetailData {
  jobId: string;
  candidateId: string;
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
  explanation: {
    strongMatchesReason: string;
    gapsReason: string;
    overallReason: string;
  };
}

interface CandidateNote {
  id: string;
  content: string;
  createdAt: string;
  author?: {
    name: string;
    email: string;
  };
}

interface StatusHistory {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  createdAt: string;
  reason?: string | null;
  notes?: string | null;
  actor?: {
    name: string;
    email: string;
  };
}

const CANDIDATE_TRANSITION_MAP: Record<string, string[]> = {
  REVIEW_REQUIRED: ['APPROVED', 'REJECTED'],
  APPROVED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['SCREENING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'SCREENING', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['HIRED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  HIRED: ['OFFER', 'WITHDRAWN'],
  REJECTED: ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER'],
  WITHDRAWN: ['APPROVED', 'SHORTLISTED', 'SCREENING', 'INTERVIEW', 'OFFER'],
};

export default function MatchDetailModal({
  isOpen,
  onClose,
  jobId,
  candidateId,
  candidateName,
  onStatusUpdated,
}: MatchDetailModalProps) {
  const [data, setData] = useState<MatchDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Tabs inside modal
  const [modalTab, setModalTab] = useState<'analysis' | 'pipeline'>('analysis');

  // Recruiter Notes states
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Status History Timeline states
  const [history, setHistory] = useState<StatusHistory[]>([]);

  // Rejection confirmation states
  const [confirmingRejection, setConfirmingRejection] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('Lacks required skills');
  const [rejectionNotes, setRejectionNotes] = useState('');

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/candidates/${candidateId}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to fetch match analysis.');
      }
      setData(json);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [jobId, candidateId]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/history`);
      const json = await res.json();
      if (res.ok) setHistory(json);
    } catch (e) {
      console.error('Failed to load status history', e);
    }
  }, [candidateId]);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes?jobId=${jobId}`);
      const json = await res.json();
      if (res.ok) setNotes(json);
    } catch (e) {
      console.error('Failed to load candidate notes', e);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchDetails();
    fetchHistory();
    fetchNotes();
  }, [isOpen, fetchDetails, fetchHistory, fetchNotes]);

  const handleUpdateStatus = async (status: string, reason?: string, trNotes?: string) => {
    setActionLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        status,
        jobId,
        expectedPreviousStatus: data?.candidate?.status,
      };
      if (reason) payload.reason = reason;
      if (trNotes) payload.notes = trNotes;

      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('client: handleUpdateStatus response status:', res.status);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update candidate status.');
      }
      console.log('client: handleUpdateStatus success for candidate status:', status);
      onStatusUpdated(status);
      onClose();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setActionLoading(false);
      setConfirmingRejection(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    setSubmittingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, content: newNoteContent }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to submit note.');
      }
      setNewNoteContent('');
      fetchNotes();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setSubmittingNote(false);
    }
  };

  if (!isOpen) return null;

  const currentStatus = data?.candidate?.status || 'APPROVED';
  const allowedTransitions = CANDIDATE_TRANSITION_MAP[currentStatus] || [];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: '0 1rem',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Candidate Match & Pipeline</h3>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>
              {candidateName} &bull; Status: <strong style={{ textTransform: 'uppercase', color: 'hsl(var(--accent))' }}>{currentStatus}</strong>
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'hsl(var(--foreground) / 0.5)' }}
            id="close-match-modal"
          >
            &times;
          </button>
        </div>

        {/* Navigation Modal Tabs */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.25rem' }}>
          <button
            onClick={() => setModalTab('analysis')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: modalTab === 'analysis' ? 'hsl(var(--accent))' : 'hsl(var(--foreground) / 0.5)',
              borderBottom: modalTab === 'analysis' ? '2px solid hsl(var(--accent))' : 'none',
              paddingBottom: '0.25rem',
            }}
            id="modal-tab-analysis"
          >
            AI Match Analysis
          </button>
          <button
            onClick={() => setModalTab('pipeline')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: modalTab === 'pipeline' ? 'hsl(var(--accent))' : 'hsl(var(--foreground) / 0.5)',
              borderBottom: modalTab === 'pipeline' ? '2px solid hsl(var(--accent))' : 'none',
              paddingBottom: '0.25rem',
            }}
            id="modal-tab-pipeline"
          >
            Pipeline & Recruiter Notes ({notes.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>Loading candidate details...</div>
        ) : error ? (
          <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
            {error}
          </div>
        ) : !data ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* TAB: Analysis & Grounding */}
            {modalTab === 'analysis' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Score Overview Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  <div className="card" style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid hsl(var(--accent) / 0.3)', backgroundColor: 'hsl(var(--accent) / 0.05)' }}>
                    <span style={{ display: 'block', fontSize: '0.675rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>Overall Score</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--accent))' }}>{data.match.finalScore}%</span>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.675rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>Semantic similarity</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.match.semanticScore}%</span>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.675rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>Required skills</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.match.requiredSkillsScore}%</span>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.675rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>Preferred skills</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.match.preferredSkillsScore}%</span>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.675rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>Experience Match</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, display: 'block', marginTop: '0.25rem' }}>{data.match.experienceStatus}</span>
                    <span style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)' }}>({data.match.candidateYears} yrs total)</span>
                  </div>
                </div>

                {/* AI Insights Reasons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'hsl(var(--card))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, margin: 0, color: 'hsl(var(--foreground))' }}>AI Explanations (Grounded in Resume)</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    <div>
                      <strong style={{ color: 'hsl(var(--success))' }}>&bull; Strong matches: </strong>
                      <span style={{ color: 'hsl(var(--foreground) / 0.8)' }}>{data.explanation.strongMatchesReason}</span>
                    </div>
                    <div>
                      <strong style={{ color: 'hsl(var(--danger))' }}>&bull; Gaps identified: </strong>
                      <span style={{ color: 'hsl(var(--foreground) / 0.8)' }}>{data.explanation.gapsReason}</span>
                    </div>
                    <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <strong>Overall Match Verdict: </strong>
                      <span style={{ color: 'hsl(var(--foreground) / 0.8)', fontStyle: 'italic' }}>{data.explanation.overallReason}</span>
                    </div>
                  </div>
                </div>

                {/* Grounding & Evidence table */}
                <div>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, marginBottom: '0.5rem', marginTop: 0 }}>Grounding & Evidence Trace</h4>
                  <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}>
                          <th style={{ padding: '0.5rem 0.75rem', width: '30%' }}>Requirement</th>
                          <th style={{ padding: '0.5rem 0.75rem', width: '20%' }}>Status</th>
                          <th style={{ padding: '0.5rem 0.75rem', width: '50%' }}>Verbatim Excerpt from Resume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.match.matchedSkills.map((skill, idx) => (
                          <tr key={`match-${idx}`} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{skill}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--success))', fontWeight: 700 }}>✓ Confirmed</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--foreground) / 0.8)', fontStyle: 'italic' }}>
                              &quot;{data.match.skillGroundingMap[skill]}&quot;
                            </td>
                          </tr>
                        ))}
                        {data.match.missingSkills.map((skill, idx) => (
                          <tr key={`miss-${idx}`} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{skill}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--danger))', fontWeight: 700 }}>! Not Found</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--foreground) / 0.4)' }}>
                              No explicit mention in candidate resume.
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legacy Quick Shortlist/Reject Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '1rem' }}>
                  <button
                    onClick={() => handleUpdateStatus('REJECTED')}
                    className="btn btn-secondary"
                    disabled={actionLoading}
                    style={{ color: 'hsl(var(--danger))', fontSize: '0.875rem' }}
                    id="btn-reject-candidate"
                  >
                    {actionLoading ? 'Saving...' : 'Reject Candidate'}
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('SHORTLISTED')}
                    className="btn btn-primary"
                    disabled={actionLoading}
                    style={{ fontSize: '0.875rem' }}
                    id="btn-shortlist-candidate"
                  >
                    {actionLoading ? 'Saving...' : 'Shortlist Candidate'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Pipeline & Notes */}
            {modalTab === 'pipeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Pipeline Transition Actions */}
                <div style={{ backgroundColor: 'hsl(var(--card))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, margin: '0 0 0.75rem 0' }}>Pipeline Decisions & Stage Transitions</h4>
                  
                  {confirmingRejection ? (
                    /* Destructive Rejection Confirmation Form */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid hsl(var(--danger) / 0.3)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'hsl(var(--danger) / 0.03)' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'hsl(var(--danger))' }}>Confirm Candidate Rejection?</span>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Rejection Reason:</label>
                        <select
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ width: '100%', padding: '0.4rem', fontSize: '0.825rem', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                          id="rejection-reason-select"
                        >
                          <option value="Lacks required skills">Lacks required technical skills</option>
                          <option value="Failed interview stage">Failed interview evaluations</option>
                          <option value="Salary expectations">Salary mismatch / expectations</option>
                          <option value="Candidate withdrew">Candidate withdrew from process</option>
                          <option value="Other">Other reason</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Notes / Justification:</label>
                        <textarea
                          placeholder="Provide details for rejecting this candidate..."
                          value={rejectionNotes}
                          onChange={(e) => setRejectionNotes(e.target.value)}
                          style={{ width: '100%', padding: '0.4rem', fontSize: '0.825rem', minHeight: '60px', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                          id="rejection-notes-textarea"
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        <button
                          onClick={() => setConfirmingRejection(false)}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateStatus('REJECTED', rejectionReason, rejectionNotes)}
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger))' }}
                          id="btn-confirm-rejection"
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* General transition action buttons */
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }} id="pipeline-transition-actions">
                      {allowedTransitions.map((stage) => {
                        const isRejected = stage === 'REJECTED';
                        const isWithdrawn = stage === 'WITHDRAWN';
                        
                        return (
                          <button
                            key={stage}
                            onClick={() => {
                              if (isRejected) {
                                setConfirmingRejection(true);
                              } else {
                                handleUpdateStatus(stage);
                              }
                            }}
                            className={`btn ${isRejected ? 'btn-secondary' : 'btn-primary'}`}
                            style={{
                              fontSize: '0.825rem',
                              padding: '0.35rem 0.7rem',
                              color: isRejected ? 'hsl(var(--danger))' : isWithdrawn ? 'hsl(var(--foreground) / 0.6)' : undefined,
                            }}
                            id={`btn-transition-${stage.toLowerCase()}`}
                          >
                            Move to {stage}
                          </button>
                        );
                      })}
                      {allowedTransitions.length === 0 && (
                        <span style={{ fontSize: '0.825rem', color: 'hsl(var(--foreground) / 0.4)' }}>No further valid transitions available for status: {currentStatus}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Recruiter Notes Block */}
                <div>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Recruiter Notes</h4>
                  
                  {/* Notes creation Form */}
                  <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="Add recruiter feedback / interview evaluation notes..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.825rem', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                      id="input-candidate-note"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !newNoteContent.trim()}
                      className="btn btn-primary"
                      style={{ fontSize: '0.825rem', padding: '0.4rem 0.8rem' }}
                      id="btn-add-note"
                    >
                      {submittingNote ? 'Saving...' : 'Add Note'}
                    </button>
                  </form>

                  {/* Notes Timeline List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid hsl(var(--border))', padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'hsl(var(--card) / 0.2)' }} id="recruiter-notes-list">
                    {notes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.4)' }}>
                        No notes created yet for this candidate.
                      </div>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} style={{ padding: '0.5rem', borderBottom: '1px solid hsl(var(--border) / 0.4)', fontSize: '0.825rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: 'hsl(var(--foreground) / 0.5)', marginBottom: '0.2rem' }}>
                            <strong>{note.author?.name || 'Recruiter'}</strong>
                            <span>{new Date(note.createdAt).toLocaleString()}</span>
                          </div>
                          <div style={{ color: 'hsl(var(--foreground) / 0.9)', whiteSpace: 'pre-wrap' }} className="candidate-note-content">
                            {note.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Status History Timeline */}
                <div>
                  <h4 style={{ fontSize: '0.925rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Hiring Timeline & Audit Log</h4>
                  <div style={{ border: '1px solid hsl(var(--border))', padding: '0.5rem', borderRadius: 'var(--radius-sm)', maxHeight: '180px', overflowY: 'auto', backgroundColor: 'hsl(var(--card) / 0.2)' }} id="status-history-timeline">
                    {history.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.4)' }}>
                        No pipeline transitions recorded yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.25rem' }}>
                        {history.map((log) => (
                          <div key={log.id} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.825rem', borderLeft: '2px solid hsl(var(--accent) / 0.3)', paddingLeft: '0.75rem', position: 'relative' }}>
                            {/* Dot indicator */}
                            <div style={{
                              position: 'absolute',
                              left: '-5px',
                              top: '4px',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: 'hsl(var(--accent))',
                            }} />

                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: 'hsl(var(--foreground) / 0.5)' }}>
                                <span>Action by: <strong>{log.actor?.name || 'Recruiter'}</strong></span>
                                <span>{new Date(log.createdAt).toLocaleString()}</span>
                              </div>
                              <div style={{ marginTop: '0.15rem' }}>
                                Moved from <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{log.previousStatus || 'INIT'}</span> &rarr; <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'hsl(var(--accent))' }}>{log.newStatus}</span>
                              </div>
                              {(log.reason || log.notes) && (
                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.6)', backgroundColor: 'hsl(var(--foreground) / 0.03)', padding: '0.25rem', borderRadius: '2px', marginTop: '0.25rem' }}>
                                  {log.reason && <div><strong>Reason:</strong> {log.reason}</div>}
                                  {log.notes && <div><strong>Note:</strong> {log.notes}</div>}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
