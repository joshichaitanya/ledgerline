import { randomUUID } from 'crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';
import { startRedis, startTransactionsDb } from './containers';

const JWT_SECRET = 'test-secret';
// An access token as auth-service issues it (see services/toolkit).
const bearer = (userId: number) => `Bearer ${jwt.sign({ userId, jti: randomUUID() }, JWT_SECRET, { expiresIn: '15m' })}`;

let db: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let pool: Pool;
let app: Express;
let cache: typeof import('../src/cache').cache;

// Each test uses its own user, so tests don't see each other's rows or cache keys.
let userId = 1000;
beforeEach(() => {
  userId++;
});

// GET as the current test's user.
const get = (path: string) => request(app).get(path).set('Authorization', bearer(userId));

beforeAll(async () => {
  const [startedDb, startedRedis] = await Promise.all([startTransactionsDb(), startRedis()]);
  db = startedDb.container;
  redis = startedRedis.container;
  pool = new Pool({ connectionString: startedDb.databaseUrl });

  // src/app.ts, src/db.ts and src/cache.ts read these at import time, so set them first.
  process.env.DATABASE_URL = startedDb.databaseUrl;
  process.env.REDIS_URL = startedRedis.redisUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  ({ app } = await import('../src/app'));
  ({ cache } = await import('../src/cache'));

  // The cache connects in the background (not awaited) - wait for it here so
  // tests don't race it and silently take the no-cache path.
  for (let i = 0; i < 50 && !cache.isReady; i++) await new Promise((r) => setTimeout(r, 100));
  expect(cache.isReady).toBe(true);
});

afterAll(async () => {
  if (cache?.isOpen) await cache.quit();
  await (await import('../src/db')).pool.end();
  await pool?.end();
  await Promise.all([db?.stop(), redis?.stop()]);
});

// Rows as db-writer-service leaves them (it's the only writer).
async function insert(t: { amount: number; date: string; subcategory?: string; deleted?: boolean; user?: number }) {
  await pool.query(
    `INSERT INTO transactions (id, user_id, subcategory_id, amount, description, transaction_date, deleted_at)
     VALUES ($1, $2, $3, $4, 'test', $5, $6)`,
    [randomUUID(), t.user ?? userId, t.subcategory ?? 'groceries', t.amount, t.date, t.deleted ? new Date() : null]
  );
}

describe('auth (ADR 0013)', () => {
  it('rejects requests with no token with 401', async () => {
    await request(app).get('/transactions').expect(401);
    await request(app).get('/transactions/summary?year=2026').expect(401);
  });

  it("only ever returns the token's user's data - ?userId= is ignored", async () => {
    await insert({ amount: 10, date: '2026-10-01T10:00:00Z' });
    await insert({ amount: 99, date: '2026-10-01T10:00:00Z', user: userId + 500 });

    const list = await get(`/transactions?userId=${userId + 500}`).expect(200);
    expect(list.body.map((t: { amount: number }) => t.amount)).toEqual([10]);

    const summary = await get(`/transactions/summary?userId=${userId + 500}&year=2026&month=10`).expect(200);
    expect(summary.body).toEqual([{ month: '2026-10', bySubcategory: { groceries: 10 } }]);
  });
});

describe('GET /transactions', () => {
  it("returns the user's transactions newest first, skipping deleted ones", async () => {
    await insert({ amount: 10, date: '2026-10-01T10:00:00Z' });
    await insert({ amount: 20, date: '2026-10-05T10:00:00Z' });
    await insert({ amount: 99, date: '2026-10-03T10:00:00Z', deleted: true });
    await insert({ amount: 50, date: '2026-10-04T10:00:00Z', user: userId + 500 });

    const res = await get('/transactions').expect(200);

    expect(res.body.map((t: { amount: number }) => t.amount)).toEqual([20, 10]);
    expect(res.body[0]).toMatchObject({
      userId,
      subCategoryId: 'groceries',
      amount: 20, // a number, not numeric's string
      transactionDate: '2026-10-05T10:00:00.000Z',
    });
  });

  it('returns a tombstone-only user as empty (no crash on its NULL columns)', async () => {
    await pool.query(
      `INSERT INTO transactions (id, user_id, deleted_at, last_event_at) VALUES ($1, $2, now(), now())`,
      [randomUUID(), userId]
    );

    await get('/transactions').expect(200, []);
  });
});

describe('GET /transactions/summary', () => {
  it('totals one month by subcategory, skipping deleted rows and other users', async () => {
    await insert({ amount: 10, date: '2026-10-01T10:00:00Z', subcategory: 'groceries' });
    await insert({ amount: 5.25, date: '2026-10-20T10:00:00Z', subcategory: 'groceries' });
    await insert({ amount: 60, date: '2026-10-15T10:00:00Z', subcategory: 'fuel' });
    await insert({ amount: 999, date: '2026-10-15T10:00:00Z', deleted: true });
    await insert({ amount: 999, date: '2026-10-15T10:00:00Z', user: userId + 500 });
    await insert({ amount: 999, date: '2026-09-30T10:00:00Z' });

    const res = await get('/transactions/summary?year=2026&month=10').expect(200);

    expect(res.body).toEqual([{ month: '2026-10', bySubcategory: { groceries: 15.25, fuel: 60 } }]);
  });

  it('uses UTC months: 23:30 UTC on Oct 31 is October, 00:30 UTC on Nov 1 is November', async () => {
    await insert({ amount: 1, date: '2026-10-31T23:30:00Z' });
    await insert({ amount: 2, date: '2026-11-01T00:30:00Z' });

    const res = await get('/transactions/summary?year=2026').expect(200);

    expect(res.body[9]).toEqual({ month: '2026-10', bySubcategory: { groceries: 1 } });
    expect(res.body[10]).toEqual({ month: '2026-11', bySubcategory: { groceries: 2 } });
  });

  it('without month, returns all 12 months of the year in order', async () => {
    await insert({ amount: 7, date: '2026-03-10T10:00:00Z' });

    const res = await get('/transactions/summary?year=2026').expect(200);

    expect(res.body.map((m: { month: string }) => m.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
    );
    expect(res.body[2].bySubcategory).toEqual({ groceries: 7 });
    expect(res.body[0].bySubcategory).toEqual({});
  });

  it('a miss computes from transactions-db and caches it with a 1h TTL', async () => {
    await insert({ amount: 10, date: '2026-10-01T10:00:00Z' });
    const key = `user:${userId}:month:2026-10`;
    expect(await cache.get(key)).toBeNull();

    await get('/transactions/summary?year=2026&month=10').expect(200);

    expect(JSON.parse((await cache.get(key))!)).toEqual({ groceries: 10 });
    const ttl = await cache.ttl(key);
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('a hit is served from the cache, not transactions-db', async () => {
    await insert({ amount: 10, date: '2026-10-01T10:00:00Z' });
    // A value transactions-db could never produce - only the cache can return it.
    await cache.set(`user:${userId}:month:2026-10`, JSON.stringify({ FROM_CACHE: 1 }));

    const res = await get('/transactions/summary?year=2026&month=10').expect(200);

    expect(res.body).toEqual([{ month: '2026-10', bySubcategory: { FROM_CACHE: 1 } }]);
  });

  it('mixes cached and computed months in one response', async () => {
    await insert({ amount: 3, date: '2026-02-10T10:00:00Z' });
    await cache.set(`user:${userId}:month:2026-01`, JSON.stringify({ FROM_CACHE: 1 }));

    const res = await get('/transactions/summary?year=2026').expect(200);

    expect(res.body[0].bySubcategory).toEqual({ FROM_CACHE: 1 });
    expect(res.body[1].bySubcategory).toEqual({ groceries: 3 });
  });

  it.each([
    ['no year', ''],
    ['month 0', '?year=2026&month=0'],
    ['month 13', '?year=2026&month=13'],
    ['non-numeric year', '?year=abc'],
  ])('rejects bad input (%s) with 400', async (_, query) => {
    await get(`/transactions/summary${query}`).expect(400);
  });
});
