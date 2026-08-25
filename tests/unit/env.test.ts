import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/lib/env';

describe('Phase 4D — Production Environment Safeguards', () => {
  const validBaseEnv = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/aptihire',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars-long!',
    NODE_ENV: 'test',
  };

  it('passes validation for valid test/development environment', () => {
    const parsed = validateEnv(validBaseEnv);
    expect(parsed.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(parsed.JWT_SECRET).toBe(validBaseEnv.JWT_SECRET);
  });

  it('rejects production environment if DISABLE_RATE_LIMIT is true', () => {
    const prodEnvWithBypass = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      DISABLE_RATE_LIMIT: 'true',
      GEMINI_API_KEY: 'test-gemini-key',
    };

    expect(() => validateEnv(prodEnvWithBypass)).toThrow(/Application environment validation failed/);
  });

  it('rejects production environment if GEMINI_API_KEY is missing when AI_PROVIDER_TYPE is gemini', () => {
    const prodEnvNoGeminiKey = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      AI_PROVIDER_TYPE: 'gemini',
    };

    expect(() => validateEnv(prodEnvNoGeminiKey)).toThrow(/Application environment validation failed/);
  });

  it('allows production environment when valid GEMINI_API_KEY and rate limiting are present', () => {
    const validProdEnv = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      GEMINI_API_KEY: 'valid-secret-gemini-key-12345',
    };

    const parsed = validateEnv(validProdEnv);
    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.GEMINI_API_KEY).toBe('valid-secret-gemini-key-12345');
  });

  it('rejects JWT_SECRET under 32 characters in any environment', () => {
    const shortSecretEnv = {
      ...validBaseEnv,
      JWT_SECRET: 'too-short',
    };

    expect(() => validateEnv(shortSecretEnv)).toThrow(/Application environment validation failed/);
  });

  it('does not leak secret values in thrown exception messages', () => {
    const invalidSecretValue = 'secret-value-that-should-never-be-in-logs-1234';
    const envWithShortSecret = {
      ...validBaseEnv,
      JWT_SECRET: invalidSecretValue,
    };

    try {
      validateEnv(envWithShortSecret);
      expect.fail('Should have thrown validation error');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      expect(errMsg).not.toContain(invalidSecretValue);
    }
  });
});
