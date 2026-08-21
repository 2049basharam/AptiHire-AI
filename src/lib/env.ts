import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid connection URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

let parsedEnv: z.infer<typeof envSchema>;

try {
  parsedEnv = envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingOrInvalid = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n');
    console.error("❌ Environment validation failed:\n" + missingOrInvalid);
    throw new Error("Application environment validation failed. Check your .env file.");
  }
  throw error;
}

export const env = parsedEnv;
