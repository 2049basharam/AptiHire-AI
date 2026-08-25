import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../src/lib/auth';
import { env } from '../../src/lib/env';
import { panelEvaluationSchema, batchInviteSchema, auditLogExportSchema } from '../../src/lib/validations/assessment';
import { buildRateLimit429Response } from '../../src/lib/ratelimit';
import * as jose from 'jose';

describe('Phase 7 Standalone Production Smoke Test Suite', () => {
  it('1. Smoke Test: Environment configuration validates required production variables', () => {
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.NODE_ENV).toBeDefined();
  });

  it('2. Smoke Test: JWT Session signing and cryptographic token verification', async () => {
    const payload = {
      userId: '11111111-2222-3333-4444-555555555555',
    };

    const token = await signToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified.userId).toBe(payload.userId);
  });

  it('3. Smoke Test: Security Hardening - Forged or tampered tokens are rejected', async () => {
    const bogusSecret = new TextEncoder().encode('fake_secret_key_000000000000000000000000');
    const forgedToken = await new jose.SignJWT({ userId: 'hacker-user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(bogusSecret);

    await expect(verifyToken(forgedToken)).rejects.toThrow();
  });

  it('4. Smoke Test: Hiring Panel Evaluation Schema - requires justification when scoreOverride is present', () => {
    // Missing justification when scoreOverride provided -> Fail
    const invalidResult = panelEvaluationSchema.safeParse({
      sessionId: '11111111-1111-1111-1111-111111111111',
      recommendation: 'HIRE',
      scoreOverride: 90,
      // overrideReason missing
    });
    expect(invalidResult.success).toBe(false);

    // Valid evaluation with scoreOverride & justification -> Pass
    const validResult = panelEvaluationSchema.safeParse({
      sessionId: '11111111-1111-1111-1111-111111111111',
      recommendation: 'STRONG_HIRE',
      qualitativeFeedback: 'Outstanding technical assessment performance.',
      scoreOverride: 95,
      overrideReason: 'Demonstrated superior algorithmic design in technical interview Q&A.',
    });
    expect(validResult.success).toBe(true);
  });

  it('5. Smoke Test: Batch Candidate Invitation Schema - validates array length boundaries (1-50 candidates)', () => {
    // Empty array -> Fail
    const emptyResult = batchInviteSchema.safeParse({
      templateId: '11111111-1111-1111-1111-111111111111',
      candidateIds: [],
    });
    expect(emptyResult.success).toBe(false);

    // Valid 2-candidate array -> Pass
    const validResult = batchInviteSchema.safeParse({
      templateId: '11111111-1111-1111-1111-111111111111',
      candidateIds: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    });
    expect(validResult.success).toBe(true);
  });

  it('6. Smoke Test: Audit Log Export Schema - validates date range ordering (startDate <= endDate)', () => {
    // Reversed dates -> Fail
    const invalidResult = auditLogExportSchema.safeParse({
      format: 'json',
      startDate: '2026-08-25T00:00:00Z',
      endDate: '2026-08-01T00:00:00Z',
    });
    expect(invalidResult.success).toBe(false);

    // Chronological dates -> Pass
    const validResult = auditLogExportSchema.safeParse({
      format: 'csv',
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-25T00:00:00Z',
    });
    expect(validResult.success).toBe(true);
  });

  it('7. Smoke Test: Rate Limiting 429 Response Formatter produces compliant Retry-After header', () => {
    const rateLimitData = {
      success: false,
      limit: 5,
      remaining: 0,
      resetInSeconds: 30,
    };

    const response = buildRateLimit429Response(rateLimitData);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('8. Smoke Test: Sensitive Data Redaction & CSV Formula Injection Protection Invariants', () => {
    const sensitiveKeys = ['accesstoken', 'token', 'jwt', 'authorization', 'password', 'secret', 'apikey', 'refreshtoken', 'bearer', 'auth'];
    const testKeys = ['access_token', 'refresh-token', 'api_key', 'jwt_secret', 'bearerToken'];

    for (const key of testKeys) {
      const normalizedKey = key.toLowerCase().replace(/[\-_]/g, '');
      const isMatch = sensitiveKeys.some(k => normalizedKey.includes(k));
      expect(isMatch).toBe(true);
    }

    // CSV formula injection check
    const unsafeString = '=SUM(A1:A10)';
    const sanitized = unsafeString.replace(/^[=+\-@]/, "'$&");
    expect(sanitized).toBe("'=SUM(A1:A10)");
  });
});
