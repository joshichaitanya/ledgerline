import { randomUUID } from 'crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startTransactionsDb } from './containers';

// Its own file (so its own module instances): src/cache.ts is pointed at a
// port nothing listens on, so Redis is never available. The summary must
// still work, computed from transactions-db (ADR 0011).

const JWT_SECRET = 'test-secret';

let db: StartedPostgreSqlContainer;
let pool: Pool;
let app: Express;

beforeAll(async () => {
  const started = await startTransactionsDb();
  db = started.container;
  pool = new Pool({ connectionString: started.databaseUrl });

  process.env.DATABASE_URL = started.databaseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.JWT_SECRET = JWT_SECRET;
  ({ app } = await import('../src/app'));
});

afterAll(async () => {
  const { cache } = await import('../src/cache');
  if (cache.isOpen) await cache.disconnect();
  await (await import('../src/db')).pool.end();
  await pool?.end();
  await db?.stop();
});

it('serves the summary from transactions-db when Redis is down', async () => {
  await pool.query(
    `INSERT INTO transactions (id, user_id, subcategory_id, amount, description, transaction_date)
     VALUES ($1, 1, 'fuel', 60, 'test', '2026-10-15T10:00:00Z')`,
    [randomUUID()]
  );

  const started = Date.now();
  const res = await request(app)
    .get('/transactions/summary?year=2026&month=10')
    .set('Authorization', `Bearer ${jwt.sign({ userId: 1, jti: randomUUID() }, JWT_SECRET)}`)
    .expect(200);

  expect(res.body).toEqual([{ month: '2026-10', bySubcategory: { fuel: 60 } }]);
  // Fails fast instead of waiting on Redis (disableOfflineQueue in src/cache.ts).
  expect(Date.now() - started).toBeLessThan(2000);
});
