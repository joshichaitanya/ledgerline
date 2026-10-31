import { randomUUID } from 'crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startEventStoreDb } from './event-store-db';

const JWT_SECRET = 'test-secret';
// An access token as auth-service issues it (see services/toolkit).
const bearer = (userId: number) => `Bearer ${jwt.sign({ userId, jti: randomUUID() }, JWT_SECRET, { expiresIn: '15m' })}`;

let db: StartedPostgreSqlContainer;
let pool: Pool;
let app: Express;

beforeAll(async () => {
  const started = await startEventStoreDb();
  db = started.container;
  pool = new Pool({ connectionString: started.databaseUrl });

  // EventStoreRecorder and app.ts read these at import time.
  process.env.DATABASE_URL = started.databaseUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  ({ app } = await import('../src/app'));
});

afterAll(async () => {
  // The recorder's pool is private - closed directly so its idle connections
  // don't error when the container stops.
  const { EventStoreRecorder } = await import('../src/services/event-store-recorder.service');
  await (EventStoreRecorder.getInstance() as unknown as { pool: Pool }).pool.end();
  await pool?.end();
  await db?.stop();
});

describe('DELETE /transactions/:transactionId', () => {
  it("writes a 'delete' (tombstone) row for the token's user - a new row, never a real DELETE (ADR 0005)", async () => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO event_store (id, item_id, user_id, operation, payload) VALUES ($1, $2, 7, 'create', '{}')`,
      [randomUUID(), id]
    );

    // No body needed any more - the user comes from the token.
    await request(app).delete(`/transactions/${id}`).set('Authorization', bearer(7)).expect(202);

    const { rows } = await pool.query(
      `SELECT operation, user_id, payload FROM event_store WHERE item_id = $1 ORDER BY created_at`,
      [id]
    );
    expect(rows).toEqual([
      { operation: 'create', user_id: 7, payload: {} },
      { operation: 'delete', user_id: 7, payload: { transactionId: id, userId: 7 } },
    ]);
  });

  it("ignores a userId in the body - the token's user wins (ADR 0013)", async () => {
    const id = randomUUID();

    await request(app).delete(`/transactions/${id}`).set('Authorization', bearer(7)).send({ userId: 999 }).expect(202);

    const { rows } = await pool.query(`SELECT user_id FROM event_store WHERE item_id = $1`, [id]);
    expect(rows).toEqual([{ user_id: 7 }]);
  });

  it('rejects a request with no token with 401', async () => {
    await request(app).delete(`/transactions/${randomUUID()}`).expect(401);
  });
});
