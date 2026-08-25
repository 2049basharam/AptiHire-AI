import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid connection URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DISABLE_RATE_LIMIT: z.string().optional(),
  ENABLE_TEST_ENDPOINTS: z.string().optional(),
  AI_PROVIDER_TYPE: z.enum(['gemini', 'mock', 'test']).optional().default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
}).superRefine((data, ctx) => {
  // Production safeguard: rate limiting must never be disabled in production
  if (data.NODE_ENV === 'production' && data.DISABLE_RATE_LIMIT === 'true') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DISABLE_RATE_LIMIT'],
      message: 'DISABLE_RATE_LIMIT cannot be set to true in production environment',
    });
  }

  // Gemini API key requirement when not explicitly running test/mock AI provider or build-time page collection
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const isMockOrTest = data.AI_PROVIDER_TYPE === 'test' || data.AI_PROVIDER_TYPE === 'mock';

  if (!isBuildPhase && !isMockOrTest && data.NODE_ENV === 'production' && !data.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'GEMINI_API_KEY is required for production/development AI execution',
    });
  }
});

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  try {
    const isTestRunner = rawEnv.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const cleanStr = (val: string | undefined) => (val ? val.trim().replace(/[\r\n]/g, '') : val);

    return envSchema.parse({
      DATABASE_URL: cleanStr(rawEnv.DATABASE_URL),
      REDIS_URL: cleanStr(rawEnv.REDIS_URL),
      JWT_SECRET: cleanStr(rawEnv.JWT_SECRET),
      NODE_ENV: cleanStr(rawEnv.NODE_ENV),
      DISABLE_RATE_LIMIT: cleanStr(rawEnv.DISABLE_RATE_LIMIT),
      ENABLE_TEST_ENDPOINTS: cleanStr(rawEnv.ENABLE_TEST_ENDPOINTS),
      AI_PROVIDER_TYPE: cleanStr(rawEnv.AI_PROVIDER_TYPE) || (isTestRunner ? 'test' : undefined),
      GEMINI_API_KEY: cleanStr(rawEnv.GEMINI_API_KEY),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Safe error reporting without exposing sensitive secret values
      const missingOrInvalid = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n');
      console.error("❌ Environment validation failed:\n" + missingOrInvalid);
      throw new Error("Application environment validation failed. Check your .env configuration.");
    }
    throw error;
  }
}

export const env = validateEnv(process.env);

