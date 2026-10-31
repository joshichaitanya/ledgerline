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

const body = { subCategoryId: 'fuel', amount: 75, description: 'Petrol', transactionDate: '2026-10-20T10:00:00Z' };

describe('PUT /transactions/:transactionId', () => {
  it("writes an 'update' row with the full transaction as its payload, for the token's user", async () => {
    const id = randomUUID();

    await request(app).put(`/transactions/${id}`).set('Authorization', bearer(7)).send(body).expect(202);

    const { rows } = await pool.query(`SELECT item_id, user_id, operation, payload FROM event_store WHERE item_id = $1`, [id]);
    expect(rows).toEqual([{ item_id: id, user_id: 7, operation: 'update', payload: { ...body, transactionId: id, userId: 7 } }]);
  });

  it("the URL's id and the token's user win over the body's", async () => {
    const id = randomUUID();

    await request(app)
      .put(`/transactions/${id}`)
      .set('Authorization', bearer(7))
      .send({ ...body, transactionId: randomUUID(), userId: 999 })
      .expect(202);

    const { rows } = await pool.query(
      `SELECT user_id, payload->>'transactionId' AS payload_id, payload->>'userId' AS payload_user FROM event_store WHERE item_id = $1`,
      [id]
    );
    expect(rows).toEqual([{ user_id: 7, payload_id: id, payload_user: '7' }]);
  });

  it('rejects a request with no token with 401', async () => {
    await request(app).put(`/transactions/${randomUUID()}`).send(body).expect(401);
  });
});
