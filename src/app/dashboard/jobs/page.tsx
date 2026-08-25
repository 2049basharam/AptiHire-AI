import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BriefcaseIcon } from '@/components/icons';
import { db, jobs, memberships, eq } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
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

  // 2. Fetch jobs strictly scoped to organization
  const orgJobs = await db.query.jobs.findMany({
    where: eq(jobs.organizationId, organization.id),
    orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
  });

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
              {organization.name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/dashboard" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              ← Back to Dashboard
            </Link>
            <Link href="/dashboard/jobs/create" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              + Create Job Opening
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '2.5rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Job Openings</h1>
              <p style={{ fontSize: '0.9rem', color: 'hsl(var(--foreground) / 0.65)', marginTop: '0.2rem' }}>
                Manage, publish, and evaluate candidate pipelines for active job positions.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-success">
                {orgJobs.length} {orgJobs.length === 1 ? 'Job Opening' : 'Job Openings'}
              </span>
            </div>
          </div>

          {orgJobs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', borderRadius: '16px', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ color: 'hsl(var(--primary))', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                <BriefcaseIcon size={48} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'hsl(var(--foreground))' }}>No Active Job Openings</h3>
              <p style={{ color: 'hsl(var(--foreground) / 0.65)', marginBottom: '1.5rem', maxWidth: '440px', marginInline: 'auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Get started by creating your first job opening. Define requirements manually or use Gemini AI extraction for automated skill structuring.
              </p>
              <Link href="/dashboard/jobs/create" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '10px' }}>
                Create First Job Opening →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1.15rem' }}>
              {orgJobs.map((job) => (
                <div key={job.id} className="card card-interactive" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.35rem 1.65rem', borderRadius: '14px' }}>
                  <div style={{ flex: 1, paddingRight: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                      <Link href={`/dashboard/jobs/${job.id}`} style={{ fontWeight: 700, fontSize: '1.15rem', textDecoration: 'none', color: 'hsl(var(--primary))' }}>
                        {job.title}
                      </Link>
                      <span className={`badge ${job.status === 'PUBLISHED' ? 'badge-success' : job.status === 'ARCHIVED' ? 'badge-secondary' : 'badge-ai'}`} style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        {job.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.7)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                      {job.description}
                    </p>
                  </div>
                  <div>
                    <Link href={`/dashboard/jobs/${job.id}`} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}>
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
