import { describe, expect, it, vi } from 'vitest';
import { InvalidationClient, SpendTotalsInvalidator } from '../src/spend-summary-cache';

// A Redis stand-in that can go down and come back on demand - what matters
// here is the invalidator's catch-up logic, not Redis itself.
function fakeRedis() {
  const deleted: string[] = [];
  const client = {
    isReady: true,
    del: vi.fn(async (keys: string[]) => {
      deleted.push(...keys);
      return keys.length;
    }),
  };
  return { client: client as InvalidationClient & typeof client, deleted };
}

const oct = { userId: 1, transactionDate: new Date('2026-10-10T12:00:00Z') };
const sep = { userId: 1, transactionDate: new Date('2026-09-15T12:00:00Z') };

describe('SpendTotalsInvalidator', () => {
  it('deletes the month keys a change touched', async () => {
    const { client, deleted } = fakeRedis();
    await new SpendTotalsInvalidator(client).invalidate([oct, sep]);

    expect(deleted.sort()).toEqual(['user:1:month:2026-09', 'user:1:month:2026-10']);
  });

  it('months are UTC: 23:30 UTC on Oct 31 is October, wherever the server runs', async () => {
    const { client, deleted } = fakeRedis();
    await new SpendTotalsInvalidator(client).invalidate([{ userId: 1, transactionDate: new Date('2026-10-31T23:30:00Z') }]);

    expect(deleted).toEqual(['user:1:month:2026-10']);
  });

  it('keeps keys it could not delete while Redis was down, and deletes them once it is back', async () => {
    const { client, deleted } = fakeRedis();
    const invalidator = new SpendTotalsInvalidator(client);

    client.isReady = false;
    await invalidator.invalidate([oct]);
    expect(deleted).toEqual([]);
    expect(invalidator.pendingKeys).toEqual(['user:1:month:2026-10']);

    client.isReady = true;
    await invalidator.flush(); // what the client's 'ready' event triggers
    expect(deleted).toEqual(['user:1:month:2026-10']);
    expect(invalidator.pendingKeys).toEqual([]);
  });

  it('keeps keys pending when DEL itself fails, and catches up with the next change', async () => {
    const { client, deleted } = fakeRedis();
    const invalidator = new SpendTotalsInvalidator(client);

    client.del.mockRejectedValueOnce(new Error('connection reset'));
    await invalidator.invalidate([oct]);
    expect(invalidator.pendingKeys).toEqual(['user:1:month:2026-10']);

    await invalidator.invalidate([sep]);
    expect(deleted.sort()).toEqual(['user:1:month:2026-09', 'user:1:month:2026-10']);
    expect(invalidator.pendingKeys).toEqual([]);
  });

  it('never throws, even when Redis keeps failing', async () => {
    const { client } = fakeRedis();
    client.del.mockRejectedValue(new Error('down'));

    await expect(new SpendTotalsInvalidator(client).invalidate([oct])).resolves.toBeUndefined();
  });
});
