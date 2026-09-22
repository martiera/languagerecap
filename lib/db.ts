import { Pool } from 'pg';
import { getRuntimeConfig } from '@/lib/runtime-config';

const globalForDb = globalThis as unknown as { pool?: Pool };
export const pool = globalForDb.pool ?? new Pool({ connectionString: getRuntimeConfig().databaseUrl });
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;
