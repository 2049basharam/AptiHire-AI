import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1rem 0', backgroundColor: 'hsl(var(--card))' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'hsl(var(--foreground))' }}>
            Talent<span style={{ color: 'hsl(var(--primary))' }}>OS</span>
          </div>
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/login" className="btn btn-secondary">
              Login
            </Link>
            <Link href="/register" className="btn btn-primary">
              Register
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Hero */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '4rem 0' }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: '800px' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <span className="badge badge-ai">AI-Native HR Tech</span>
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>
            Recruitment intelligence, built for modern hiring teams.
          </h1>
          <p style={{ fontSize: '1.25rem', color: 'hsl(var(--foreground) / 0.7)', marginBottom: '2.5rem' }}>
            Match candidates, evaluate technical ability, and turn hiring workflows into explainable, evidence-based decisions.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link href="/register" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
              Start Hiring
            </Link>
            <Link href="/login" className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
              View Demo
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid hsl(var(--border))', padding: '2rem 0', backgroundColor: 'hsl(var(--card))', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>
        <div className="container">
          <p>&copy; {new Date().getFullYear()} TalentOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
