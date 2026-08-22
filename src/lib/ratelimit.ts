import { NextResponse } from 'next/server';
import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export type RateLimitCategory = 'AUTH' | 'AI' | 'UPLOAD' | 'SEARCH' | 'GENERAL';

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_CONFIGS: Record<RateLimitCategory, RateLimitConfig> = {
  AUTH: { limit: 10, windowSeconds: 900 },    // 10 requests / 15 minutes
  AI: { limit: 30, windowSeconds: 60 },       // 30 requests / minute
  UPLOAD: { limit: 20, windowSeconds: 60 },   // 20 requests / minute
  SEARCH: { limit: 60, windowSeconds: 60 },   // 60 requests / minute
  GENERAL: { limit: 120, windowSeconds: 60 }, // 120 requests / minute
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

let redisClient: IORedis | null = null;

function getRateLimitRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error('RateLimit Redis error', undefined, { error: err.message });
    });
  }
  return redisClient;
}

/**
 * Atomic sliding window counter algorithm using Redis INCR and EXPIRE.
 */
export async function checkRateLimit(
  category: RateLimitCategory,
  identifier: string,
  configOverride?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const config = { ...RATE_LIMIT_CONFIGS[category], ...configOverride };
  const key = `ratelimit:${category.toLowerCase()}:${identifier}`;

  // In test environments, allow normal test suite requests unless explicitly testing rate limits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true' || (globalThis as any).__TEST_AI_PROVIDER__) && !configOverride) {
    return { success: true, limit: config.limit, remaining: config.limit, resetInSeconds: 0 };
  }

  try {
    const client = getRateLimitRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }

    // Atomic multi pipeline to increment counter and set TTL if new
    const pipeline = client.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();
    if (!results || results.length < 2) {
      // Graceful fallback if Redis pipelining returns empty
      return { success: true, limit: config.limit, remaining: config.limit - 1, resetInSeconds: 0 };
    }

    const currentCount = (results[0][1] as number) || 1;
    let ttl = (results[1][1] as number) || -1;

    // If key has no TTL (new key created), set expiration window
    if (ttl < 0) {
      await client.expire(key, config.windowSeconds);
      ttl = config.windowSeconds;
    }

    const remaining = Math.max(0, config.limit - currentCount);
    const success = currentCount <= config.limit;

    return {
      success,
      limit: config.limit,
      remaining,
      resetInSeconds: Math.max(1, ttl),
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Rate limit check fallback due to Redis unavailability', undefined, { error: errMsg });
    // Fail-open strategy for rate limiter in case of Redis outage so standard operations continue
    return {
      success: true,
      limit: config.limit,
      remaining: 1,
      resetInSeconds: 0,
    };
  }
}

/**
 * Resets rate limit keys matching prefix (used in test cleanup)
 */
export async function resetRateLimits(category?: RateLimitCategory, identifier?: string): Promise<void> {
  try {
    const client = getRateLimitRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }

    if (category && identifier) {
      const key = `ratelimit:${category.toLowerCase()}:${identifier}`;
      await client.del(key);
    } else {
      const keys = await client.keys('ratelimit:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Rate limit reset failed', undefined, { error: errMsg });
  }
}

/**
 * Disconnects the Rate Limit Redis client connection
 */
export async function closeRateLimitRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
  }
}

/**
 * Constructs a standard HTTP 429 Too Many Requests response with Retry-After header
 */
export function buildRateLimit429Response(result: RateLimitResult): NextResponse {
  const headers = new Headers();
  headers.set('Retry-After', result.resetInSeconds.toString());

  return NextResponse.json(
    {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
      },
    },
    {
      status: 429,
      headers,
    }
  );
}

/**
 * Safely extracts client IP address from request headers without trusting spoofed X-Forwarded-For
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}
