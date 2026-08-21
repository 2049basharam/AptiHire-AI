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
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link href="/dashboard" style={{ fontWeight: 700, fontSize: '1.25rem', textDecoration: 'none', color: 'hsl(var(--foreground))' }}>
              TalentOS
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              {organization.name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/dashboard" className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
              Back to Dashboard
            </Link>
            <CandidateUploadModal />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Candidates & Resumes</h1>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>Ingest resumes, parse skills with AI, and track verification stages.</p>
            </div>
            <div>
              <span className="badge badge-success">Active Workspace</span>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {orgCandidates.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📄</div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Candidates Found</h3>
                <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                  Upload PDF or DOCX candidate resumes to begin parsing them using Gemini resume intelligence.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                      <th style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)' }}>
                        Candidate Name
                      </th>
                      <th style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)' }}>
                        Source File
                      </th>
                      <th style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)' }}>
                        Ingestion Status
                      </th>
                      <th style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)' }}>
                        Uploaded Date
                      </th>
                      <th style={{ padding: '0.875rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.6)', textAlign: 'right' }}>
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

                      let statusBadge = <span className="badge badge-secondary">{candidate.status}</span>;
                      if (candidate.status === 'UPLOADED' || candidate.status === 'QUEUED') {
                        statusBadge = <span className="badge" style={{ backgroundColor: 'hsl(35 100% 90%)', color: 'hsl(35 100% 30%)' }}>Queued</span>;
                      } else if (candidate.status === 'PROCESSING' || candidate.status === 'AI_PROCESSING') {
                        statusBadge = <span className="badge" style={{ backgroundColor: 'hsl(210 100% 90%)', color: 'hsl(210 100% 35%)' }}>Processing</span>;
                      } else if (candidate.status === 'REVIEW_REQUIRED') {
                        statusBadge = <span className="badge" style={{ backgroundColor: 'hsl(270 100% 90%)', color: 'hsl(270 100% 35%)' }}>Review Required</span>;
                      } else if (candidate.status === 'APPROVED') {
                        statusBadge = <span className="badge badge-success">Approved</span>;
                      } else if (candidate.status.startsWith('FAILED')) {
                        statusBadge = <span className="badge badge-danger">Failed</span>;
                      }

                      return (
                        <tr key={candidate.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                          <td style={{ padding: '1rem 1.5rem', fontWeight: 500, fontSize: '0.925rem' }}>
                            {displayName}
                            {candidate.email && (
                              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'hsl(var(--foreground) / 0.6)', marginTop: '0.125rem' }}>
                                {candidate.email}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
                            {doc ? doc.fileName : 'No file'}
                          </td>
                          <td style={{ padding: '1rem 1.5rem' }}>
                            {statusBadge}
                          </td>
                          <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>
                            {new Date(candidate.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                            <Link href={`/dashboard/candidates/${candidate.id}`} className="btn btn-secondary" style={{ fontSize: '0.825rem', padding: '0.25rem 0.5rem' }}>
                              View Details
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
