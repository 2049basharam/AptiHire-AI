'use client';

import React, { useState, useEffect, use } from 'react';
import { CheckCircleIcon } from '@/components/icons';

interface Question {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'CODING_CHALLENGE';
  title: string;
  prompt: string;
  options?: { key: string; label: string }[];
  allowedLanguages?: string[];
  points: number;
  orderIndex: number;
  publicTestCases?: { id: string; input: string; expectedOutput: string; points: number }[];
}

interface AssessmentData {
  session: {
    id: string;
    status: string;
    startedAt?: string;
    submittedAt?: string;
    expiresAt: string;
    candidateName: string;
  };
  template: {
    id: string;
    title: string;
    description?: string;
    timeLimitMinutes: number;
  };
  questions: Question[];
  answers: {
    questionId: string;
    selectedOption?: string;
    textAnswer?: string;
    submittedCode?: string;
    programmingLanguage?: string;
  }[];
}

export default function CandidateAssessmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [data, setData] = useState<AssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, {
    selectedOption?: string;
    textAnswer?: string;
    submittedCode?: string;
    programmingLanguage?: string;
  }>>({});

  const [savingAnswer, setSavingAnswer] = useState(false);
  const [submittingSession, setSubmittingSession] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);

  // Fetch assessment data by token
  useEffect(() => {
    async function fetchSession() {
      try {
        setLoading(true);
        const res = await fetch(`/api/assessments/sessions/candidate?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error?.message || 'Failed to load assessment session');
          setLoading(false);
          return;
        }

        setData(json);

        // Prepopulate answers
        const initialAnswers: Record<string, { selectedOption?: string; textAnswer?: string; submittedCode?: string; programmingLanguage?: string }> = {};
        if (json.answers) {
          json.answers.forEach((ans: { questionId: string; selectedOption?: string; textAnswer?: string; submittedCode?: string; programmingLanguage?: string }) => {
            initialAnswers[ans.questionId] = {
              selectedOption: ans.selectedOption || undefined,
              textAnswer: ans.textAnswer || undefined,
              submittedCode: ans.submittedCode || undefined,
              programmingLanguage: ans.programmingLanguage || undefined,
            };
          });
        }
        setUserAnswers(initialAnswers);
        setLoading(false);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setLoading(false);
      }
    }
    fetchSession();
  }, [token]);

  // Live countdown timer
  useEffect(() => {
    if (!data?.session.expiresAt || data.session.status !== 'IN_PROGRESS') return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(data.session.expiresAt).getTime() - Date.now()) / 1000));
      setTimeRemainingSeconds(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        handleFinalize();
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session.expiresAt, data?.session.status]);

  const handleStartSession = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/assessments/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const updated = await res.json();
      if (!res.ok) {
        setError(updated.error?.message || 'Failed to start assessment session');
        setLoading(false);
        return;
      }
      // Refresh session
      window.location.reload();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setLoading(false);
    }
  };

  const handleSaveAnswer = async (questionId: string, answerPayload: { selectedOption?: string; textAnswer?: string; submittedCode?: string; programmingLanguage?: string }) => {
    try {
      setSavingAnswer(true);
      setUserAnswers((prev) => ({
        ...prev,
        [questionId]: { ...prev[questionId], ...answerPayload },
      }));

      await fetch('/api/assessments/sessions/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          questionId,
          ...answerPayload,
        }),
      });
      setSavingAnswer(false);
    } catch (err: unknown) {
      console.error('Failed to save answer:', err);
      setSavingAnswer(false);
    }
  };

  const handleFinalize = async () => {
    try {
      setSubmittingSession(true);
      const res = await fetch('/api/assessments/sessions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const json = await res.json();
        setError(json.error?.message || 'Failed to submit assessment');
        setSubmittingSession(false);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setSubmittingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <p className="text-secondary">Loading technical assessment portal...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container" style={{ paddingTop: '4rem' }}>
        <div className="card glass-panel" style={{ borderColor: 'var(--danger)', padding: '2rem' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Assessment Error</h2>
          <p>{error || 'Assessment session not found.'}</p>
        </div>
      </div>
    );
  }

  const { session, template, questions } = data;
  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = currentQuestion ? userAnswers[currentQuestion.id] : undefined;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // State: INVITED - Show Welcome Screen
  if (session.status === 'INVITED') {
    return (
      <div className="container" style={{ paddingTop: '3rem', maxWidth: '750px' }}>
        <div className="card glass-panel" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '1rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
            Technical Assessment Invitation
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>{template.title}</h1>
          <p className="text-secondary" style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>{template.description || 'Welcome to your technical assessment. Please read the guidelines below before starting.'}</p>

          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '2rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Assessment Details & Guidelines</h4>
            <ul style={{ listStyle: 'disc', paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'grid', gap: '0.5rem' }}>
              <li>Candidate Name: <strong>{session.candidateName}</strong></li>
              <li>Time Limit: <strong>{template.timeLimitMinutes} minutes</strong></li>
              <li>Total Questions: <strong>{questions.length}</strong></li>
              <li>Once you click <strong>&quot;Start Assessment&quot;</strong>, the timer will begin and cannot be paused.</li>
            </ul>
          </div>

          <button onClick={handleStartSession} className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}>
            Start Assessment ({template.timeLimitMinutes} Mins)
          </button>
        </div>
      </div>
    );
  }

  // State: SUBMITTED / EVALUATED / FINALIZED - Show Completion Screen
  if (session.status === 'SUBMITTED' || session.status === 'PROCESSING' || session.status === 'EVALUATED' || session.status === 'REVIEWED' || session.status === 'FINALIZED') {
    return (
      <div className="container" style={{ paddingTop: '4rem', maxWidth: '650px', textAlign: 'center' }}>
        <div className="card glass-panel" style={{ padding: '3rem' }}>
          <div style={{ color: 'hsl(var(--success))', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            <CheckCircleIcon size={48} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>Assessment Submitted</h2>
          <p className="text-secondary" style={{ lineHeight: '1.6', marginBottom: '1.5rem' }}>
            Thank you, <strong>{session.candidateName}</strong>. Your technical assessment responses have been submitted successfully and sent to the hiring team for evaluation.
          </p>
          <div className="badge pill-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '0.5rem 1rem' }}>
            Status: {session.status}
          </div>
        </div>
      </div>
    );
  }

  // State: IN_PROGRESS - Active Timed Assessment Screen
  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      {/* Top Header Bar */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{template.title}</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Candidate: {session.candidateName}</span>
        </div>

        {/* Live Timer Widget */}
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Time Remaining</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'monospace', color: timeRemainingSeconds && timeRemainingSeconds < 300 ? 'var(--danger)' : 'var(--primary)' }}>
            {timeRemainingSeconds !== null ? formatTimer(timeRemainingSeconds) : '--:--'}
          </span>
        </div>
      </div>

      {/* Main Grid: Sidebar Navigator + Question Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem' }}>
        {/* Sidebar Question List */}
        <div className="card glass-panel" style={{ padding: '1rem' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Questions ({questions.length})
          </h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {questions.map((q, idx) => {
              const isAnswered = !!userAnswers[q.id]?.selectedOption || !!userAnswers[q.id]?.textAnswer || !!userAnswers[q.id]?.submittedCode;
              const isActive = idx === currentQuestionIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className="btn"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                    textAlign: 'left',
                    background: isActive ? 'var(--primary)' : isAnswered ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#fff' : isAnswered ? '#10b981' : 'var(--text-primary)',
                    border: '1px solid ' + (isActive ? 'var(--primary)' : 'rgba(255,255,255,0.08)'),
                  }}
                >
                  <span>Q{idx + 1}. {q.title.length > 18 ? q.title.slice(0, 18) + '...' : q.title}</span>
                  <span style={{ fontSize: '0.75rem' }}>{isAnswered ? '✓' : `${q.points}pts`}</span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={handleFinalize}
              disabled={submittingSession}
              className="btn btn-danger"
              style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem' }}
            >
              {submittingSession ? 'Submitting...' : 'Submit Assessment'}
            </button>
          </div>
        </div>

        {/* Question Workspace */}
        <div className="card glass-panel" style={{ padding: '2rem' }}>
          {currentQuestion ? (
            <div>
              {/* Question Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <span className="badge pill-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', marginBottom: '0.5rem' }}>
                    {currentQuestion.type} ({currentQuestion.points} Points)
                  </span>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '0.25rem' }}>
                    Question {currentQuestionIndex + 1}: {currentQuestion.title}
                  </h2>
                </div>

                {savingAnswer && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Saving answer...</span>
                )}
              </div>

              {/* Prompt Box */}
              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1.25rem', borderRadius: '0.5rem', marginBottom: '1.75rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
                {currentQuestion.prompt}
              </div>

              {/* Type 1: Multiple Choice */}
              {currentQuestion.type === 'MULTIPLE_CHOICE' && currentQuestion.options && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {currentQuestion.options.map((opt) => {
                    const isSelected = currentAnswer?.selectedOption === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleSaveAnswer(currentQuestion.id, { selectedOption: opt.key })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '1rem 1.25rem',
                          borderRadius: '0.5rem',
                          background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                          color: '#fff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '0.95rem',
                        }}
                      >
                        <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginRight: '1rem', fontSize: '0.85rem' }}>
                          {opt.key}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Type 2: Free Text */}
              {currentQuestion.type === 'FREE_TEXT' && (
                <div>
                  <textarea
                    rows={6}
                    className="form-control"
                    placeholder="Type your explanation or response here..."
                    value={currentAnswer?.textAnswer || ''}
                    onChange={(e) => handleSaveAnswer(currentQuestion.id, { textAnswer: e.target.value })}
                    style={{ width: '100%', fontFamily: 'inherit', padding: '1rem' }}
                  />
                </div>
              )}

              {/* Type 3: Coding Challenge */}
              {currentQuestion.type === 'CODING_CHALLENGE' && (
                <div>
                  <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Language:</label>
                    <select
                      className="form-control"
                      style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      value={currentAnswer?.programmingLanguage || currentQuestion.allowedLanguages?.[0] || 'python'}
                      onChange={(e) => handleSaveAnswer(currentQuestion.id, { programmingLanguage: e.target.value })}
                    >
                      {(currentQuestion.allowedLanguages || ['python', 'javascript']).map((lang) => (
                        <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    rows={12}
                    className="form-control"
                    placeholder="# Write your solution function here..."
                    value={currentAnswer?.submittedCode || ''}
                    onChange={(e) => handleSaveAnswer(currentQuestion.id, { submittedCode: e.target.value })}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem', padding: '1rem', background: '#0d1117', color: '#e6edf3', lineHeight: '1.5' }}
                  />

                  {/* Public Test Cases Reference */}
                  {currentQuestion.publicTestCases && currentQuestion.publicTestCases.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Example Test Cases</h4>
                      <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {currentQuestion.publicTestCases.map((tc) => (
                          <div key={tc.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.85rem', borderRadius: '0.375rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                            <div><span style={{ color: 'var(--text-secondary)' }}>Input:</span> {tc.input}</div>
                            <div><span style={{ color: 'var(--text-secondary)' }}>Expected:</span> {tc.expectedOutput}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                  className="btn btn-secondary"
                  style={{ opacity: currentQuestionIndex === 0 ? 0.4 : 1 }}
                >
                  ← Previous Question
                </button>

                <button
                  disabled={currentQuestionIndex === questions.length - 1}
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                  className="btn btn-primary"
                  style={{ opacity: currentQuestionIndex === questions.length - 1 ? 0.4 : 1 }}
                >
                  Next Question →
                </button>
              </div>
            </div>
          ) : (
            <p className="text-secondary">No questions found in this assessment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
