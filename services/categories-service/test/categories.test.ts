import { randomUUID } from 'crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startReferenceDb } from './reference-db';

const JWT_SECRET = 'test-secret';
// An access token as auth-service issues it (see services/toolkit).
const bearer = (userId: number) => `Bearer ${jwt.sign({ userId, jti: randomUUID() }, JWT_SECRET, { expiresIn: '15m' })}`;

const FOOD_AND_DINING = '0cb7dfea-2a07-445d-841b-0a56f42dd4f2';

let db: StartedPostgreSqlContainer;
let app: Express;

// Each test gets fresh users, so one test's custom categories never leak into another's.
let user = 100;
let other = 100;
beforeEach(() => {
  user += 2;
  other = user + 1;
});

const as = (userId: number) => ({
  get: (path: string) => request(app).get(path).set('Authorization', bearer(userId)),
  post: (path: string, body: object) => request(app).post(path).set('Authorization', bearer(userId)).send(body),
});

beforeAll(async () => {
  const started = await startReferenceDb();
  db = started.container;

  // src/app.ts and src/db.ts read these at import time.
  process.env.DATABASE_URL = started.databaseUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  ({ app } = await import('../src/app'));
});

afterAll(async () => {
  await (await import('../src/db')).pool.end();
  await db?.stop();
});

describe('GET /categories', () => {
  it('returns the 12 shared defaults, in order, with their subcategories', async () => {
    const res = await as(user).get('/categories').expect(200);

    expect(res.body).toHaveLength(12);
    expect(res.body.map((c: { name: string }) => c.name).slice(0, 3)).toEqual(['Food & Dining', 'Transport', 'Shopping']);
    expect(res.body[0]).toMatchObject({ id: FOOD_AND_DINING, custom: false });
    expect(res.body[0].subcategories.map((s: { name: string }) => s.name)).toEqual([
      'Groceries',
      'Restaurants',
      'Cafe',
      'Food Delivery',
      'Snacks',
    ]);
  });

  it('rejects a request with no token with 401', async () => {
    await request(app).get('/categories').expect(401);
  });
});

describe('POST /categories', () => {
  it("creates a category only its owner sees, listed after the defaults", async () => {
    const created = await as(user).post('/categories', { name: 'Hobbies' }).expect(201);
    expect(created.body).toMatchObject({ name: 'Hobbies', custom: true, subcategories: [] });

    const mine = await as(user).get('/categories').expect(200);
    expect(mine.body).toHaveLength(13);
    expect(mine.body[12]).toMatchObject({ id: created.body.id, name: 'Hobbies', custom: true });

    const theirs = await as(other).get('/categories').expect(200);
    expect(theirs.body).toHaveLength(12);
  });

  it("rejects a name the user can already see - a default or their own, any case - with 409", async () => {
    await as(user).post('/categories', { name: 'food & dining' }).expect(409);

    await as(user).post('/categories', { name: 'Pets' }).expect(201);
    await as(user).post('/categories', { name: 'PETS' }).expect(409);
  });

  it("allows two users to each have their own category with the same name", async () => {
    await as(user).post('/categories', { name: 'Garden' }).expect(201);
    await as(other).post('/categories', { name: 'Garden' }).expect(201);
  });

  it.each([[{}], [{ name: '' }], [{ name: '   ' }], [{ name: 42 }], [{ name: 'x'.repeat(101) }]])(
    'rejects an invalid name (%j) with 400',
    async (body) => {
      await as(user).post('/categories', body).expect(400);
    }
  );

  it('trims the name', async () => {
    const res = await as(user).post('/categories', { name: '  Holidays  ' }).expect(201);
    expect(res.body.name).toBe('Holidays');
  });
});

describe('POST /categories/:categoryId/subcategories', () => {
  it('adds a subcategory under a default category, seen only by its owner', async () => {
    const created = await as(user).post(`/categories/${FOOD_AND_DINING}/subcategories`, { name: 'Bakery' }).expect(201);
    expect(created.body).toMatchObject({ name: 'Bakery', custom: true });

    const mine = await as(user).get('/categories').expect(200);
    expect(mine.body[0].subcategories.at(-1)).toMatchObject({ id: created.body.id, name: 'Bakery', custom: true });

    const theirs = await as(other).get('/categories').expect(200);
    expect(theirs.body[0].subcategories.map((s: { name: string }) => s.name)).not.toContain('Bakery');
  });

  it('adds a subcategory under the user\'s own category', async () => {
    const category = await as(user).post('/categories', { name: 'Music' }).expect(201);

    await as(user).post(`/categories/${category.body.id}/subcategories`, { name: 'Lessons' }).expect(201);

    const mine = await as(user).get('/categories').expect(200);
    const music = mine.body.find((c: { id: string }) => c.id === category.body.id);
    expect(music.subcategories).toEqual([expect.objectContaining({ name: 'Lessons', custom: true })]);
  });

  it("can't add under another user's category - it's a 404, as if it didn't exist", async () => {
    const theirs = await as(other).post('/categories', { name: 'Secret' }).expect(201);

    await as(user).post(`/categories/${theirs.body.id}/subcategories`, { name: 'Peek' }).expect(404);
  });

  it('404 for a category id that does not exist, or is not a uuid', async () => {
    await as(user).post(`/categories/${randomUUID()}/subcategories`, { name: 'X' }).expect(404);
    await as(user).post('/categories/not-a-uuid/subcategories', { name: 'X' }).expect(404);
  });

  it('rejects a name the user can already see in that category with 409', async () => {
    await as(user).post(`/categories/${FOOD_AND_DINING}/subcategories`, { name: 'groceries' }).expect(409);
  });

  it('rejects an invalid name with 400', async () => {
    await as(user).post(`/categories/${FOOD_AND_DINING}/subcategories`, { name: '' }).expect(400);
  });
});
