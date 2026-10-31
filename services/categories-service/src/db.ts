import { Pool } from 'pg';

// reference-db, which this service owns (docs/adr/0015).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
