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

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: randomUUID(),
    subCategoryId: 'groceries',
    amount: 42.5,
    description: 'Weekly groceries',
    transactionDate: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

describe('POST /transactions', () => {
  it("writes one 'create' row to event_store per transaction, keyed by its id, for the token's user", async () => {
    const a = transaction();
    const b = transaction({ amount: 60, subCategoryId: 'fuel' });

    await request(app).post('/transactions').set('Authorization', bearer(7)).send([a, b]).expect(202);

    const { rows } = await pool.query(
      `SELECT item_id, user_id, operation, payload FROM event_store WHERE item_id = ANY($1) ORDER BY payload->>'amount'`,
      [[a.transactionId, b.transactionId]]
    );
    expect(rows).toEqual([
      { item_id: a.transactionId, user_id: 7, operation: 'create', payload: { ...a, userId: 7 } },
      { item_id: b.transactionId, user_id: 7, operation: 'create', payload: { ...b, userId: 7 } },
    ]);
  });

  it("ignores a userId in the body - the token's user wins (ADR 0013)", async () => {
    const t = transaction({ userId: 999 });

    await request(app).post('/transactions').set('Authorization', bearer(7)).send([t]).expect(202);

    const { rows } = await pool.query(`SELECT user_id, payload->>'userId' AS payload_user FROM event_store WHERE item_id = $1`, [
      t.transactionId,
    ]);
    expect(rows).toEqual([{ user_id: 7, payload_user: '7' }]);
  });

  it('never updates or deletes existing rows - posting the same id twice adds a second row (ADR 0005)', async () => {
    const t = transaction();

    await request(app).post('/transactions').set('Authorization', bearer(7)).send([t]).expect(202);
    await request(app).post('/transactions').set('Authorization', bearer(7)).send([t]).expect(202);

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM event_store WHERE item_id = $1`, [t.transactionId]);
    expect(rows[0].n).toBe(2);
  });

  it('rejects a request with no token, or a token signed with the wrong secret, with 401', async () => {
    await request(app).post('/transactions').send([transaction()]).expect(401);

    const forged = `Bearer ${jwt.sign({ userId: 7, jti: randomUUID() }, 'wrong-secret')}`;
    await request(app).post('/transactions').set('Authorization', forged).send([transaction()]).expect(401);
  });

  it('rejects a body that is not an array of transactions with 400, writing nothing', async () => {
    const single = transaction();

    for (const body of [single, [single, 'not-an-object'], [[single]]]) {
      await request(app).post('/transactions').set('Authorization', bearer(7)).send(body).expect(400);
    }

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM event_store WHERE item_id = $1`, [single.transactionId]);
    expect(rows[0].n).toBe(0);
  });

  it('returns 500 (not a hang) when the write fails', async () => {
    // transactionId must be a uuid (event_store.item_id), so this insert fails.
    await request(app)
      .post('/transactions')
      .set('Authorization', bearer(7))
      .send([transaction({ transactionId: 'not-a-uuid' })])
      .expect(500);
  });
});
