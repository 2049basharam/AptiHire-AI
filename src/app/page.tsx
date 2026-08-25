import Link from 'next/link';
import { FileTextIcon, TargetIcon, BarChartIcon, SparklesIcon } from '@/components/icons';

export default function LandingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(37, 99, 235, 0.05) 0%, transparent 70%)' }}>
      {/* Header Navigation */}
      <header style={{ borderBottom: '1px solid hsl(var(--border))', padding: '1.25rem 0', backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--ai-accent)) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>
              A
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.35rem', letterSpacing: '-0.03em', color: 'hsl(var(--foreground))' }}>
              Apti<span style={{ color: 'hsl(var(--primary))' }}>Hire</span> <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', color: 'hsl(var(--ai-accent))', fontWeight: 700 }}>AI</span>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link href="/login" className="btn btn-secondary" style={{ borderRadius: '8px' }}>
              Login
            </Link>
            <Link href="/register" className="btn btn-primary" style={{ borderRadius: '8px' }}>
              Register
            </Link>
          </nav>
        </div>
      </header>
 
      {/* Main Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4rem 0 6rem 0' }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: '850px' }}>
          <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'center' }}>
            <span className="badge badge-ai" style={{ padding: '0.35rem 0.9rem', fontSize: '0.825rem', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <SparklesIcon size={14} /> Next-Gen AI Recruiting Platform
            </span>
          </div>
 
          <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.15, marginBottom: '1.5rem', letterSpacing: '-0.03em', background: 'linear-gradient(180deg, hsl(var(--foreground)) 0%, rgba(15, 23, 42, 0.75) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Intelligent hiring, grounded in evidence.
          </h1>
 
          <p style={{ fontSize: '1.25rem', color: 'hsl(var(--foreground) / 0.75)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '720px', margin: '0 auto 2.5rem auto' }}>
            Secure candidate ingestion, AI-powered resume intelligence, deterministic scoring, recruiter controls, and real-time funnel analytics.
          </p>
 
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '4rem' }}>
            <Link href="/register" className="btn btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1.05rem', borderRadius: '10px' }}>
              Start Hiring Free →
            </Link>
            <Link href="/login" className="btn btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '1.05rem', borderRadius: '10px' }}>
              View Interactive Demo
            </Link>
          </div>
 
          {/* Interactive Feature Cards Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
            <div className="card card-interactive" style={{ padding: '1.5rem', borderRadius: '14px' }}>
              <div style={{ color: 'hsl(var(--primary))', marginBottom: '0.75rem' }}>
                <FileTextIcon size={24} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Resume Intelligence</h3>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.7)', lineHeight: 1.5 }}>
                Automated PDF parsing with magic-byte security and structured skill extraction.
              </p>
            </div>
 
            <div className="card card-interactive" style={{ padding: '1.5rem', borderRadius: '14px' }}>
              <div style={{ color: 'hsl(var(--primary))', marginBottom: '0.75rem' }}>
                <TargetIcon size={24} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Semantic Matching</h3>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.7)', lineHeight: 1.5 }}>
                Deterministic cosine similarity matching isolated from LLM output hallucination.
              </p>
            </div>
 
            <div className="card card-interactive" style={{ padding: '1.5rem', borderRadius: '14px' }}>
              <div style={{ color: 'hsl(var(--primary))', marginBottom: '0.75rem' }}>
                <BarChartIcon size={24} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Funnel Analytics</h3>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.7)', lineHeight: 1.5 }}>
                Real-time conversion tracking, recruiter activity streams, and time-in-stage insights.
              </p>
            </div>
          </div>
        </div>
      </main>
 
      {/* Footer */}
      <footer style={{ borderTop: '1px solid hsl(var(--border))', padding: '2rem 0', backgroundColor: 'hsl(var(--card))', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>
        <div className="container">
          <p>&copy; {new Date().getFullYear()} AptiHire AI. Enterprise-grade production candidate intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
