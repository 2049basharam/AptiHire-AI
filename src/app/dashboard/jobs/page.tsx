import Link from 'next/link';
import { redirect } from 'next/navigation';
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
            <Link href="/dashboard/jobs/create" className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
              Create Job
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Job Openings</h1>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>Manage, analyze, and publish your open positions.</p>
            </div>
            <div>
              <span className="badge badge-success">Active Workspace</span>
            </div>
          </div>

          {orgJobs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: 'hsl(var(--foreground) / 0.8)' }}>No Job Openings Yet</div>
              <p style={{ color: 'hsl(var(--foreground) / 0.6)', marginBottom: '1.5rem', maxWidth: '400px', marginInline: 'auto' }}>
                Get started by creating your first job opening. You can write details manually or let AI extract them for review.
              </p>
              <Link href="/dashboard/jobs/create" className="btn btn-primary">
                Create First Job
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {orgJobs.map((job) => (
                <div key={job.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <Link href={`/dashboard/jobs/${job.id}`} style={{ fontWeight: 600, fontSize: '1.125rem', textDecoration: 'none', color: 'hsl(var(--primary))' }}>
                        {job.title}
                      </Link>
                      <span className={`badge ${job.status === 'PUBLISHED' ? 'badge-success' : job.status === 'ARCHIVED' ? 'badge-ai' : 'badge-secondary'}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
                        {job.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {job.description}
                    </p>
                  </div>
                  <div style={{ marginLeft: '1.5rem' }}>
                    <Link href={`/dashboard/jobs/${job.id}`} className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
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
