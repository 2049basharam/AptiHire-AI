import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { db, users, memberships, eq } from '@/db';
import { getCurrentUserId } from '@/lib/rbac';
import LogoutButton from './LogoutButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    redirect('/login');
  }

  let userDetails: { name: string; email: string };
  let orgDetails: { name: string; slug: string };
  let userRole: string;

  // Check if we are running in mock database mode (useful for offline E2E runs)
  if (process.env.MOCK_DB === 'true') {
    const cookieJar = await cookies();
    const orgCreated = cookieJar.get('org_created')?.value === 'true';
    if (!orgCreated) {
      redirect('/onboarding');
    }
    userDetails = { name: 'Test User', email: 'test@example.com' };
    orgDetails = { name: 'Acme Corp', slug: 'acme-corp' };
    userRole = 'OWNER';
  } else {
    // 1. Fetch User details
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      redirect('/login');
    }
    userDetails = { name: user.name, email: user.email };

    // 2. Fetch User Memberships
    const activeMembership = await db.query.memberships.findFirst({
      where: eq(memberships.userId, userId),
      with: {
        organization: true,
      },
    });

    // If no organization membership found, redirect to onboarding to create one
    if (!activeMembership) {
      redirect('/onboarding');
    }
    orgDetails = { name: activeMembership.organization.name, slug: activeMembership.organization.slug };
    userRole = activeMembership.role;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>TalentOS</span>
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.4)' }}>/</span>
            <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.8)' }}>
              {orgDetails.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{userDetails.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.6)' }}>{userDetails.email}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Workspace Dashboard</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', backgroundColor: 'hsl(var(--secondary))', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>
                  Active Workspace
                </span>
                <span style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                  {orgDetails.name}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)' }}>
                  Slug: {orgDetails.slug}
                </span>
              </div>

              <div style={{ padding: '1rem', backgroundColor: 'hsl(var(--secondary))', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--foreground) / 0.5)', fontWeight: 600 }}>
                  Your Access Role
                </span>
                <span style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                  {userRole}
                </span>
                <span className="badge badge-success" style={{ marginTop: '0.25rem' }}>
                  Verified
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem' }}>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Link href="/dashboard/jobs" className="card" style={{ textDecoration: 'none', display: 'block', transition: 'transform 0.2s', padding: '1rem', border: '1px solid hsl(var(--border))' }}>
                  <h4 style={{ fontWeight: 600, color: 'hsl(var(--primary))', marginBottom: '0.25rem', fontSize: '0.975rem' }}>Job Openings</h4>
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)', margin: 0 }}>Create, publish, and manage job descriptions.</p>
                </Link>
                <Link href="/dashboard/candidates" className="card" style={{ textDecoration: 'none', display: 'block', transition: 'transform 0.2s', padding: '1rem', border: '1px solid hsl(var(--border))' }}>
                  <h4 style={{ fontWeight: 600, color: 'hsl(var(--primary))', marginBottom: '0.25rem', fontSize: '0.975rem' }}>Candidates & Resumes</h4>
                  <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)', margin: 0 }}>Upload resumes, extract skills, and build profiles.</p>
                </Link>
              </div>
            </div>

            <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Phase 1 Foundation Successfully Completed</h3>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.7)', lineHeight: 1.6 }}>
                You have successfully registered, created an organization workspace, established secure HTTP-only session cookies, and resolved role permissions directly from the database. Next phases will build on top of this secure tenant-isolated core.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
