import { describe, it, expect } from 'vitest';
import { GeminiAdapter, isTransientError, withTimeoutAndRetry } from '../../src/lib/ai/gemini';

describe('Phase 4D — Gemini AI Adapter Reliability & Timeout Safeguards', () => {
  it('instantiates GeminiAdapter cleanly with API key', () => {
    const adapter = new GeminiAdapter('mock-test-gemini-key-12345');
    expect(adapter).toBeDefined();
    expect(typeof adapter.extractJobRequirements).toBe('function');
    expect(typeof adapter.extractCandidateProfile).toBe('function');
    expect(typeof adapter.generateEmbedding).toBe('function');
    expect(typeof adapter.generateMatchExplanation).toBe('function');
    expect(typeof adapter.parseCandidateSearchIntent).toBe('function');
    expect(typeof adapter.generateCandidateComparisonSummary).toBe('function');
  });

  it('correctly classifies transient vs non-transient errors for retry decisions', () => {
    // Transient status codes (must retry)
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 504 })).toBe(true);
    expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isTransientError(new Error('ECONNRESET'))).toBe(true);

    // Non-transient status codes (must fail fast)
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  it('fails fast on permanent non-transient errors without retrying', async () => {
    let callCount = 0;
    const badRequestError = Object.assign(new Error('400 Bad Request'), { status: 400 });

    await expect(
      withTimeoutAndRetry(
        async () => {
          callCount++;
          throw badRequestError;
        },
        { operationName: 'testOp', timeoutMs: 5000 }
      )
    ).rejects.toThrow('400 Bad Request');

    expect(callCount).toBe(1); // Fast fail on first attempt
  });

  it('retries transient errors up to maximum 2 retries (3 attempts total)', async () => {
    let callCount = 0;
    const rateLimitError = Object.assign(new Error('429 Too Many Requests'), { status: 429 });

    await expect(
      withTimeoutAndRetry(
        async () => {
          callCount++;
          throw rateLimitError;
        },
        { operationName: 'testOp', timeoutMs: 1000 }
      )
    ).rejects.toThrow('429 Too Many Requests');

    expect(callCount).toBe(3); // Initial attempt + 2 retries
  });

  it('succeeds after transient retry recovers on 2nd attempt', async () => {
    let callCount = 0;
    const rateLimitError = Object.assign(new Error('503 Service Unavailable'), { status: 503 });

    const result = await withTimeoutAndRetry(
      async () => {
        callCount++;
        if (callCount === 1) {
          throw rateLimitError;
        }
        return 'recovered-success';
      },
      { operationName: 'testOp', timeoutMs: 1000 }
    );

    expect(result).toBe('recovered-success');
    expect(callCount).toBe(2);
  });
});
