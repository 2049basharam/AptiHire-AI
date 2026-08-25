import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '../lib/env';

// Pool option parameters for scaling connections in serverless and test environments
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10, // Sufficient connection pool depth for test teardowns and local execution
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { pool };
export * from './schema';
export { eq, and, or, sql, inArray, gte, lte, gt, lt } from 'drizzle-orm';
