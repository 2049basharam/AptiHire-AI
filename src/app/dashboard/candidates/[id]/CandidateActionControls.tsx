'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ControlsProps {
  candidateId: string;
  status: string;
  docId?: string;
}

export default function CandidateActionControls({ candidateId, status }: ControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleApprove = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/approve`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to approve candidate profile.');
      }
      router.refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred during approval.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/retry`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to retry candidate ingestion.');
      }
      router.refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred during retry.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        {status === 'REVIEW_REQUIRED' && (
          <button 
            onClick={handleApprove}
            className="btn btn-primary" 
            style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
            disabled={isLoading}
            id="btn-approve-profile"
          >
            {isLoading ? 'Approving...' : 'Approve Profile'}
          </button>
        )}

        {status.startsWith('FAILED') && (
          <button 
            onClick={handleRetry}
            className="btn btn-primary" 
            style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
            disabled={isLoading}
            id="btn-retry-parsing"
          >
            {isLoading ? 'Retrying...' : 'Retry Ingestion'}
          </button>
        )}
      </div>

      {error && (
        <span style={{ fontSize: '0.75rem', color: 'hsl(var(--danger))', marginTop: '0.25rem' }}>
          {error}
        </span>
      )}
    </div>
  );
}
