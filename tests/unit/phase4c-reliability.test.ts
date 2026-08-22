import { describe, it, expect, vi } from 'vitest';
import { withTimeoutAndRetry, isTransientError } from '@/lib/ai/gemini';
import { resolveRequestId } from '@/lib/observability';

describe('Phase 4C Reliability & Observability Unit Tests', () => {
  describe('isTransientError()', () => {
    it('should classify HTTP 429, 500, 502, 503, 504 as transient', () => {
      expect(isTransientError(new Error('API error 429 Too Many Requests'))).toBe(true);
      expect(isTransientError(new Error('Internal Server Error 500'))).toBe(true);
      expect(isTransientError(new Error('Bad Gateway 502'))).toBe(true);
      expect(isTransientError(new Error('Service Unavailable 503'))).toBe(true);
      expect(isTransientError(new Error('Gateway Timeout 504'))).toBe(true);
      expect(isTransientError({ status: 429, message: 'Rate limit' })).toBe(true);
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isTransientError(new Error('fetch failed'))).toBe(true);
    });

    it('should classify 400 Bad Request, 401, 403, and Zod errors as non-transient', () => {
      expect(isTransientError(new Error('Output failed Zod schema validation'))).toBe(false);
      expect(isTransientError(new Error('Invalid API Key 401'))).toBe(false);
      expect(isTransientError(new Error('Forbidden 403'))).toBe(false);
      expect(isTransientError(new Error('Bad Request 400'))).toBe(false);
    });
  });

  describe('withTimeoutAndRetry()', () => {
    it('should return result on first attempt if successful', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await withTimeoutAndRetry(mockFn, {
        operationName: 'testOp',
        timeoutMs: 1000,
        maxRetries: 2,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry transient 429 errors up to maxRetries and succeed', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 429 Rate Limit'))
        .mockResolvedValueOnce('retry-success');

      const result = await withTimeoutAndRetry(mockFn, {
        operationName: 'testRetry',
        timeoutMs: 1000,
        maxRetries: 2,
      });

      expect(result).toBe('retry-success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should retry transient 503 errors and succeed on 3rd attempt', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('third-time-charm');

      const result = await withTimeoutAndRetry(mockFn, {
        operationName: 'test503Retry',
        timeoutMs: 1000,
        maxRetries: 2,
      });

      expect(result).toBe('third-time-charm');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-transient Zod validation errors without retrying', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Output failed Zod schema validation'));

      await expect(
        withTimeoutAndRetry(mockFn, {
          operationName: 'testZod',
          timeoutMs: 1000,
          maxRetries: 2,
        })
      ).rejects.toThrow('Output failed Zod schema validation');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should fail after maxRetries is exceeded on persistent 500 error', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('HTTP 500 Internal Server Error'));

      await expect(
        withTimeoutAndRetry(mockFn, {
          operationName: 'testMaxRetry',
          timeoutMs: 1000,
          maxRetries: 2,
        })
      ).rejects.toThrow('HTTP 500 Internal Server Error');

      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries = 3
    });

    it('should enforce timeout if operation takes longer than timeoutMs', async () => {
      const mockSlowFn = vi.fn().mockImplementation(() => new Promise(res => setTimeout(res, 2000)));

      await expect(
        withTimeoutAndRetry(mockSlowFn, {
          operationName: 'slowOp',
          timeoutMs: 100, // short timeout for testing
          maxRetries: 0,
        })
      ).rejects.toThrow("AI operation 'slowOp' timed out after 100ms");
    });
  });

  describe('resolveRequestId()', () => {
    it('should preserve valid incoming X-Request-ID headers', () => {
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-request-id': 'my-custom-req-id-123' },
      });
      expect(resolveRequestId(req)).toBe('my-custom-req-id-123');
    });

    it('should generate crypto UUID if X-Request-ID is absent', () => {
      const req = new Request('http://localhost/api/test');
      const id = resolveRequestId(req);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should reject invalid or oversized X-Request-ID headers and fallback to UUID', () => {
      const invalidHeaderReq = new Request('http://localhost/api/test', {
        headers: { 'x-request-id': 'bad<script>alert(1)</script>' },
      });
      const id = resolveRequestId(invalidHeaderReq);
      expect(id).not.toContain('<script>');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const oversizedHeaderReq = new Request('http://localhost/api/test', {
        headers: { 'x-request-id': 'a'.repeat(100) },
      });
      const id2 = resolveRequestId(oversizedHeaderReq);
      expect(id2).not.toBe('a'.repeat(100));
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});
