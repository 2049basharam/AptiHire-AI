'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name as user types
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // remove special characters
      .replace(/\s+/g, '-')         // replace spaces with hyphens
      .replace(/-+/g, '-');         // remove duplicate hyphens
      
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create organization.');
      }

      // Success: redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--background))', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '450px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Set Up Your Organization</h2>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.6)' }}>Create a workspace to start managing jobs and candidates.</p>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid hsl(var(--danger) / 0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="orgName">Organization Name</label>
            <input
              id="orgName"
              type="text"
              className="form-input"
              value={name}
              onChange={handleNameChange}
              required
              disabled={loading}
              placeholder="Acme Corp"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="orgSlug">Workspace URL Slug</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground) / 0.5)', marginRight: '0.25rem', userSelect: 'none' }}>
                talentos.com/org/
              </span>
              <input
                id="orgSlug"
                type="text"
                className="form-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required
                disabled={loading}
                placeholder="acme-corp"
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', marginTop: '0.25rem' }}>
              Only lowercase letters, numbers, and hyphens allowed.
            </p>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Creating Workspace...' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
