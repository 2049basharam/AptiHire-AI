import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, candidates, memberships, eq, and } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import CandidateActionControls from './CandidateActionControls';

export const dynamic = 'force-dynamic';

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    redirect('/login');
  }

  // 1. Resolve Organization membership
  const activeMembership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, userId),
    with: { organization: true },
  });

  if (!activeMembership) {
    redirect('/onboarding');
  }

  const { organization } = activeMembership;

  // 2. Fetch candidate details with strict tenant boundaries
  const candidate = await db.query.candidates.findFirst({
    where: and(eq(candidates.id, id), eq(candidates.organizationId, organization.id)),
    with: {
      documents: true,
      profiles: true,
      evidence: true,
    },
  });

  if (!candidate) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ color: 'hsl(var(--danger))', fontWeight: 600, marginBottom: '1rem' }}>Error</div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Candidate not found or access denied.</p>
          <Link href="/dashboard/candidates" className="btn btn-secondary">Back to Candidates</Link>
        </div>
      </div>
    );
  }

  const doc = candidate.documents?.[0];
  const profile = candidate.profiles?.[0];
  const evidenceList = candidate.evidence || [];

  const displayName = candidate.firstName && candidate.lastName 
    ? `${candidate.firstName} ${candidate.lastName}` 
    : `Candidate Details`;

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
            <Link href="/dashboard/candidates" style={{ fontWeight: 500, fontSize: '0.875rem', textDecoration: 'none', color: 'hsl(var(--foreground) / 0.6)' }}>
              Candidates
            </Link>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              {displayName}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/dashboard/candidates" className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
              Back to Candidates
            </Link>
            <CandidateActionControls candidateId={id} status={candidate.status} docId={doc?.id} />
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container" style={{ maxWidth: '960px' }}>
          
          {/* Status Alert Banner */}
          <div style={{ 
            padding: '1rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid hsl(var(--border))', 
            backgroundColor: 'hsl(var(--card))', 
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600, display: 'block' }}>
                Current Ingestion Lifecycle Status
              </span>
              <span style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '0.125rem', display: 'block' }} id="candidate-status-text">
                {candidate.status}
              </span>
            </div>
            <div>
              {candidate.status === 'REVIEW_REQUIRED' && (
                <span className="badge" style={{ backgroundColor: 'hsl(270 100% 90%)', color: 'hsl(270 100% 35%)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  Review and verification required
                </span>
              )}
              {candidate.status === 'APPROVED' && (
                <span className="badge badge-success" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  Profile Approved & Embedded
                </span>
              )}
              {candidate.status.startsWith('FAILED') && (
                <span className="badge badge-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  Ingestion failed
                </span>
              )}
              {(candidate.status === 'PROCESSING' || candidate.status === 'AI_PROCESSING' || candidate.status === 'QUEUED') && (
                <span className="badge" style={{ backgroundColor: 'hsl(210 100% 90%)', color: 'hsl(210 100% 35%)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  Asynchronously parsing document...
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            {/* Left Column - Parsed Resume Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Profile Summary */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Parsed Candidate Summary</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--foreground) / 0.5)' }}>[AI-Generated]</span>
                </div>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'hsl(var(--foreground) / 0.8)' }}>
                  {profile?.summary || 'No summary extracted.'}
                </p>
              </div>

              {/* Work Experience */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Work Experience</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--foreground) / 0.5)' }}>[AI-Generated]</span>
                </div>
                {profile && Array.isArray(profile.experience) && profile.experience.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(profile.experience as Array<{ role: string; company: string; startDate: string | null; endDate: string | null; description: string }>).map((exp, idx) => (
                      <div key={idx} style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid hsl(var(--border))' }}>
                        <div style={{ position: 'absolute', left: '-5px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'hsl(var(--primary))' }} />
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{exp.role}</h4>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground) / 0.7)', marginTop: '0.125rem' }}>
                          {exp.company} | <span style={{ fontSize: '0.75rem' }}>{exp.startDate} - {exp.endDate || 'Present'}</span>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                          {exp.description}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No work experiences extracted.</p>
                )}
              </div>

              {/* Education */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Education History</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--foreground) / 0.5)' }}>[AI-Generated]</span>
                </div>
                {profile && Array.isArray(profile.education) && profile.education.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {(profile.education as Array<{ degree: string; institution: string; year: string | null }>).map((edu, idx) => (
                      <div key={idx} style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--secondary) / 0.3)', borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))' }}>
                        <h4 style={{ fontSize: '0.925rem', fontWeight: 700, margin: 0 }}>{edu.degree}</h4>
                        <div style={{ fontSize: '0.825rem', color: 'hsl(var(--foreground) / 0.7)', marginTop: '0.125rem' }}>
                          {edu.institution} {edu.year ? `(${edu.year})` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No education records extracted.</p>
                )}
              </div>
            </div>

            {/* Right Column - Source Excerpts & File Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Document Source Details */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                  Resume Document
                </h3>
                {doc ? (
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, wordBreak: 'break-all' }}>{doc.fileName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.25rem' }}>
                      Size: {(doc.fileSize / 1024).toFixed(1)} KB | Format: {doc.mimeType === 'application/pdf' ? 'PDF' : 'Word (DOCX)'}
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <Link 
                        href={`/api/candidates/${id}/documents/${doc.id}/download`} 
                        className="btn btn-secondary" 
                        style={{ fontSize: '0.825rem', width: '100%', textAlign: 'center', display: 'block' }}
                        id="btn-download-resume"
                      >
                        Download Resume
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No document found.</p>
                )}
              </div>

              {/* Skills and Provenance Trace */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                  Skills Provenance
                </h3>
                {evidenceList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {evidenceList.map((ev) => (
                      <div key={ev.id} style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)', paddingBottom: '0.75rem' }}>
                        <span className="badge" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 600, fontSize: '0.75rem', display: 'inline-block', marginBottom: '0.375rem' }}>
                          {ev.skill}
                        </span>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          fontStyle: 'italic', 
                          color: 'hsl(var(--foreground) / 0.7)', 
                          backgroundColor: 'hsl(var(--secondary) / 0.5)', 
                          padding: '0.5rem', 
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: '2px solid hsl(var(--primary))',
                          lineHeight: 1.4
                        }}>
                          &quot;{ev.excerpt}&quot;
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>No skill evidence traced.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
