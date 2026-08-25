import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, candidates, memberships, eq } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import CandidateUploadModal from './CandidateUploadModal';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    redirect('/login');
  }

  // 1. Resolve active organization membership
  const activeMembership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, userId),
    with: { organization: true },
  });

  if (!activeMembership) {
    redirect('/onboarding');
  }

  const { organization } = activeMembership;

  // 2. Fetch candidates scoped strictly to the active organization
  const orgCandidates = await db.query.candidates.findMany({
    where: eq(candidates.organizationId, organization.id),
    orderBy: (candidates, { desc }) => [desc(candidates.createdAt)],
    with: {
      documents: true,
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header Navigation */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Link href="/dashboard" style={{ fontWeight: 800, fontSize: '1.25rem', textDecoration: 'none', color: 'hsl(var(--foreground))' }}>
              Apti<span style={{ color: 'hsl(var(--primary))' }}>Hire</span> AI
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              {organization.name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/dashboard" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              ← Back to Dashboard
            </Link>
            <CandidateUploadModal />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2.5rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Candidates & Resumes</h1>
              <p style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.6)', marginTop: '0.2rem' }}>
                Ingest PDF/DOCX resumes, extract skills with Gemini AI, and manage candidate pipelines.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-ai">
                ⚡ Resume Intelligence Enabled
              </span>
              <span className="badge badge-success">
                {orgCandidates.length} {orgCandidates.length === 1 ? 'Candidate' : 'Candidates'}
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }}>
            {orgCandidates.length === 0 ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>No Candidates Uploaded Yet</h3>
                <p style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.65)', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                  Upload candidate resumes to extract structured work history, technical skills, and generate evidence-based match scores.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.5)' }}>
                      <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', letterSpacing: '0.04em' }}>
                        Candidate Name
                      </th>
                      <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', letterSpacing: '0.04em' }}>
                        Source File
                      </th>
                      <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', letterSpacing: '0.04em' }}>
                        Ingestion Status
                      </th>
                      <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', letterSpacing: '0.04em' }}>
                        Uploaded Date
                      </th>
                      <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.55)', letterSpacing: '0.04em', textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgCandidates.map((candidate) => {
                      const doc = candidate.documents?.[0];
                      const displayName = candidate.firstName && candidate.lastName 
                        ? `${candidate.firstName} ${candidate.lastName}` 
                        : `Candidate #${candidate.id.substring(0, 8)}`;

                      let statusBadge = <span className="badge badge-primary">{candidate.status}</span>;
                      if (candidate.status === 'UPLOADED' || candidate.status === 'QUEUED') {
                        statusBadge = <span className="badge badge-warning">Queued</span>;
                      } else if (candidate.status === 'PROCESSING' || candidate.status === 'AI_PROCESSING') {
                        statusBadge = <span className="badge badge-ai">Processing</span>;
                      } else if (candidate.status === 'REVIEW_REQUIRED') {
                        statusBadge = <span className="badge badge-warning">Review Required</span>;
                      } else if (candidate.status === 'APPROVED') {
                        statusBadge = <span className="badge badge-success">Approved</span>;
                      } else if (candidate.status.startsWith('FAILED')) {
                        statusBadge = <span className="badge badge-danger">Failed</span>;
                      }

                      return (
                        <tr key={candidate.id} style={{ borderBottom: '1px solid hsl(var(--border) / 0.6)', transition: 'background-color 0.15s ease' }}>
                          <td style={{ padding: '1.1rem 1.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
                            {displayName}
                            {candidate.email && (
                              <span style={{ display: 'block', fontSize: '0.775rem', fontWeight: 400, color: 'hsl(var(--foreground) / 0.6)', marginTop: '0.15rem' }}>
                                {candidate.email}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '1.1rem 1.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                            <span style={{ fontFamily: 'Roboto Mono', fontSize: '0.825rem' }}>{doc ? doc.fileName : 'No file'}</span>
                          </td>
                          <td style={{ padding: '1.1rem 1.5rem' }}>
                            {statusBadge}
                          </td>
                          <td style={{ padding: '1.1rem 1.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>
                            {new Date(candidate.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '1.1rem 1.5rem', textAlign: 'right' }}>
                            <Link href={`/dashboard/candidates/${candidate.id}`} className="btn btn-secondary" style={{ fontSize: '0.825rem', padding: '0.35rem 0.75rem' }}>
                              View Candidate Profile →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
