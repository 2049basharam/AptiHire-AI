import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '../lib/env';

// Pool option parameters for scaling connections in serverless environments
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 10 : 2, // limit connection counts locally
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { pool };
export * from './schema';
export { eq, and, or, sql } from 'drizzle-orm';
