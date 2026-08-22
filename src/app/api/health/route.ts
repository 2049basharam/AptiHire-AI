import { NextResponse } from 'next/server';
import { db, sql } from '@/db';
import { createRedisConnection, candidateQueue } from '@/services/queue';
import { createObservabilityTracker } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tracker = createObservabilityTracker(req, '/api/health');
  
  let dbStatus = 'failed';
  let redisStatus = 'failed';
  let queueStatus = 'failed';

  // 1. Check PostgreSQL
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = 'ok';
  } catch {
    dbStatus = 'failed';
  }

  // 2. Check Redis
  let redisClient: ReturnType<typeof createRedisConnection> | null = null;
  try {
    redisClient = createRedisConnection();
    const pingRes = await Promise.race([
      redisClient.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 2000)),
    ]);
    if (pingRes === 'PONG') {
      redisStatus = 'ok';
    }
  } catch {
    redisStatus = 'failed';
  } finally {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }

  // 3. Check BullMQ Queue
  try {
    const jobCounts = await Promise.race([
      candidateQueue.getJobCounts('active', 'waiting', 'failed'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Queue check timeout')), 2000)),
    ]);
    if (jobCounts && typeof jobCounts === 'object') {
      queueStatus = 'ok';
    }
  } catch {
    queueStatus = 'failed';
  }

  const isHealthy = dbStatus === 'ok' && redisStatus === 'ok' && queueStatus === 'ok';
  const httpStatus = isHealthy ? 200 : 503;

  tracker.finish(httpStatus, {
    dbStatus,
    redisStatus,
    queueStatus,
  });

  return tracker.withRequestId(NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
        queue: queueStatus,
      },
    },
    { status: httpStatus }
  ));
}
