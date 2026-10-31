import { Pool } from 'pg';

// transactions-db, which only db-writer-service (the Operation consumer)
// writes to - see services/db-writer-service/README.md.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
