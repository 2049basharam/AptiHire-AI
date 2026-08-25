'use client';

import { useState, useEffect } from 'react';
import { SparklesIcon, AlertTriangleIcon } from '@/components/icons';

export default function AnalyticsDashboardWidgets() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [analyticsRes, activityRes] = await Promise.all([
          fetch('/api/analytics/dashboard'),
          fetch('/api/activity?limit=10'),
        ]);

        if (!analyticsRes.ok) throw new Error('Failed to load dashboard analytics');
        const analyticsJson = await analyticsRes.json();
        setData(analyticsJson.data);

        if (activityRes.ok) {
          const activityJson = await activityRes.json();
          setActivities(activityJson.data?.items || []);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'hsl(var(--foreground) / 0.6)' }} id="analytics-loading-state">
        <div className="pulse-indicator" style={{ color: 'hsl(var(--ai-accent))', marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
          <SparklesIcon size={24} />
        </div>
        <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>Loading operational analytics dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '1.25rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 500 }} id="analytics-error-state">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangleIcon size={16} /> {error || 'Unable to load analytics data'}
        </div>
      </div>
    );
  }

  const summary = (data.summary || {}) as Record<string, unknown>;
  const funnel = (data.funnel || {}) as Record<string, unknown>;
  const conversion = (data.conversion || {}) as Record<string, unknown>;
  const timeInStage = (data.timeInStage || []) as Record<string, unknown>[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} id="analytics-dashboard-root">
      {/* Overview Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid hsl(var(--primary))' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', fontWeight: 700, letterSpacing: '0.04em' }}>
            Total Candidates
          </span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, display: 'block', marginTop: '0.25rem', color: 'hsl(var(--foreground))' }} id="metric-total-candidates">
            {String(summary.totalCandidates || 0)}
          </span>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid hsl(var(--ai-accent))' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', fontWeight: 700, letterSpacing: '0.04em' }}>
            Active Published Jobs
          </span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, display: 'block', marginTop: '0.25rem', color: 'hsl(var(--foreground))' }} id="metric-active-jobs">
            {String(summary.activeJobs || 0)}
          </span>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid hsl(var(--success))' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', fontWeight: 700, letterSpacing: '0.04em' }}>
            Total Hires
          </span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, display: 'block', marginTop: '0.25rem', color: 'hsl(var(--success))' }} id="metric-hired-count">
            {String(summary.hiredCount || 0)}
          </span>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', borderLeft: '4px solid hsl(var(--warning))' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', fontWeight: 700, letterSpacing: '0.04em' }}>
            Conversion Rate
          </span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, display: 'block', marginTop: '0.25rem', color: 'hsl(var(--primary))' }} id="metric-conversion-rate">
            {String(summary.overallHiredRate || 0)}%
          </span>
        </div>
      </div>

      {/* Hiring Funnel Breakdown */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Hiring Funnel Breakdown</h3>
          <span className="badge badge-ai">Live Conversion Metrics</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.85rem' }} id="hiring-funnel-grid">
          {Object.entries(funnel).map(([stage, count]) => (
            <div key={stage} style={{ padding: '0.85rem 0.5rem', backgroundColor: 'hsl(var(--secondary) / 0.6)', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', textAlign: 'center', transition: 'transform 0.15s ease' }}>
              <span style={{ fontSize: '0.725rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)', fontWeight: 700, display: 'block', letterSpacing: '0.03em' }}>
                {stage}
              </span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem', display: 'block', color: 'hsl(var(--foreground))' }}>
                {String(count)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(37, 99, 235, 0.05)', borderRadius: 'var(--radius-md)', display: 'flex', flexWrap: 'wrap', gap: '1.75rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
          <span>Interview → Offer Rate: <strong style={{ color: 'hsl(var(--primary))' }}>{String(conversion.interviewToOfferRate || 0)}%</strong></span>
          <span>Offer → Hire Rate: <strong style={{ color: 'hsl(var(--success))' }}>{String(conversion.offerToHiredRate || 0)}%</strong></span>
        </div>
      </div>

      {/* Time in Stage & Activity Stream Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Time-in-Stage Analytics</h3>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }} id="time-in-stage-table">
            <thead>
              <tr style={{ borderBottom: '2px solid hsl(var(--border))', textAlign: 'left', color: 'hsl(var(--foreground) / 0.55)' }}>
                <th style={{ padding: '0.5rem 0', fontWeight: 700 }}>Stage</th>
                <th style={{ padding: '0.5rem 0', fontWeight: 700 }}>Avg Duration</th>
                <th style={{ padding: '0.5rem 0', fontWeight: 700 }}>Median</th>
              </tr>
            </thead>
            <tbody>
              {timeInStage.map((row: Record<string, unknown>) => (
                <tr key={String(row.stage)} style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                  <td style={{ padding: '0.55rem 0', fontWeight: 600 }}>{String(row.stage)}</td>
                  <td style={{ padding: '0.55rem 0' }}><span className="badge badge-primary">{String(row.avgDays)}d</span></td>
                  <td style={{ padding: '0.55rem 0', color: 'hsl(var(--foreground) / 0.7)' }}>{String(row.medianDays)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Activity Stream */}
        <div className="card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Recruiter Activity Stream</h3>
            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)' }}>Live Stream</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '270px', overflowY: 'auto' }} id="activity-stream-list">
            {activities.length === 0 ? (
              <span style={{ fontSize: '0.85rem', color: 'hsl(var(--foreground) / 0.5)', padding: '1rem 0', textAlign: 'center' }}>No recent recruiter activity recorded.</span>
            ) : (
              activities.map((act) => (
                <div key={String(act.id)} style={{ fontSize: '0.825rem', padding: '0.6rem 0.75rem', borderRadius: '8px', borderLeft: '3px solid hsl(var(--primary))', backgroundColor: 'hsl(var(--secondary) / 0.4)', transition: 'background-color 0.15s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{String(act.userName || 'System Recruiter')}</span>
                    <span style={{ fontSize: '0.7rem', color: 'hsl(var(--primary))', fontWeight: 600 }}>{String(act.type || 'ACTION')}</span>
                  </div>
                  <div style={{ color: 'hsl(var(--foreground) / 0.8)' }}>
                    {String(act.candidateName ? `${act.candidateName}: ` : '')}{String(act.details || '')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'hsl(var(--foreground) / 0.45)', marginTop: '0.2rem' }}>
                    {new Date(String(act.createdAt || '')).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
