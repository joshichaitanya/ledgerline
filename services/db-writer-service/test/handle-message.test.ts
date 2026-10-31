import { randomUUID } from 'crypto';
import { KafkaMessage } from 'kafkajs';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { TouchedSpend } from '../src/apply-operation';
import { handleMessage, HandlerDeps } from '../src/handle-message';
import { monthKey } from '../src/spend-summary-cache';
import { startTransactionsDb } from './transactions-db';

let container: StartedPostgreSqlContainer;
let pool: Pool;
let deps: HandlerDeps & {
  sendToDlq: ReturnType<typeof vi.fn>;
  invalidateSpendTotals: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  const db = await startTransactionsDb();
  container = db.container;
  pool = new Pool({ connectionString: db.databaseUrl });
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

beforeEach(() => {
  deps = {
    pool,
    sendToDlq: vi.fn().mockResolvedValue(undefined),
    invalidateSpendTotals: vi.fn().mockResolvedValue(undefined),
  };
});

// --- building Debezium messages, shaped like the real ones (see src/types/event.ts) ---

const USER_ID = 42;

// event_store.created_at as Debezium sends it: an ISO string with
// microseconds. `n` is microseconds past a fixed base, so events can be
// ordered precisely - including two in the same millisecond.
function at(n: number): string {
  return `2026-10-27T10:00:00.${String(n).padStart(6, '0')}Z`;
}

interface EventOptions {
  itemId: string;
  operation: string;
  createdAt: string;
  amount?: unknown;
  subCategoryId?: string;
  transactionDate?: string;
  userId?: number;
  op?: string;
}

function eventMessage(o: EventOptions): KafkaMessage {
  const userId = o.userId ?? USER_ID;
  const payload =
    o.operation === 'delete'
      ? { transactionId: o.itemId, userId }
      : {
          transactionId: o.itemId,
          userId,
          subCategoryId: o.subCategoryId ?? 'groceries',
          amount: o.amount ?? 10,
          description: 'test',
          transactionDate: o.transactionDate ?? '2026-10-10T12:00:00Z',
        };

  const event = {
    op: o.op ?? 'c',
    before: null,
    after: {
      id: randomUUID(),
      item_id: o.itemId,
      user_id: userId,
      operation: o.operation,
      payload: JSON.stringify(payload),
      created_at: o.createdAt,
    },
  };
  return rawMessage(JSON.stringify(event));
}

function rawMessage(value: string | null): KafkaMessage {
  return {
    key: Buffer.from('key'),
    value: value === null ? null : Buffer.from(value),
    offset: '7',
    timestamp: '0',
    attributes: 0,
    headers: {},
  } as KafkaMessage;
}

const handle = (message: KafkaMessage) => handleMessage(deps, 0, message);

async function row(itemId: string) {
  const { rows } = await pool.query(
    `SELECT user_id, subcategory_id, amount::float AS amount, transaction_date, deleted_at FROM transactions WHERE id = $1`,
    [itemId]
  );
  return rows[0];
}

// Month keys of every invalidateSpendTotals call so far.
function invalidatedKeys(): string[] {
  return deps.invalidateSpendTotals.mock.calls.flatMap(([touched]: [TouchedSpend[]]) =>
    touched.map((t) => monthKey(t.userId, t.transactionDate))
  );
}

describe('applying operations', () => {
  it('create inserts the row and invalidates its month', async () => {
    const id = randomUUID();
    expect(await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 42.5 }))).toBe('applied');

    expect(await row(id)).toMatchObject({ user_id: USER_ID, subcategory_id: 'groceries', amount: 42.5, deleted_at: null });
    expect(invalidatedKeys()).toEqual([`user:${USER_ID}:month:2026-10`]);
  });

  it('a newer update replaces the values', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 10 }));
    expect(await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(2), amount: 99, subCategoryId: 'fuel' }))).toBe('applied');

    expect(await row(id)).toMatchObject({ subcategory_id: 'fuel', amount: 99 });
  });

  it('an update moving the transaction to another month invalidates both months', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), transactionDate: '2026-10-10T12:00:00Z' }));
    deps.invalidateSpendTotals.mockClear();

    await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(2), transactionDate: '2026-09-15T12:00:00Z' }));

    expect(invalidatedKeys().sort()).toEqual([`user:${USER_ID}:month:2026-09`, `user:${USER_ID}:month:2026-10`]);
  });


  it('an update arriving before its create still creates the row', async () => {
    const id = randomUUID();
    expect(await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(1), amount: 5 }))).toBe('applied');

    expect(await row(id)).toMatchObject({ amount: 5, deleted_at: null });
  });

  it('delete sets deleted_at, keeps the data, and invalidates its month', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1) }));
    deps.invalidateSpendTotals.mockClear();

    expect(await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(2) }))).toBe('applied');

    const deleted = await row(id);
    expect(deleted.deleted_at).toBeInstanceOf(Date);
    expect(deleted.subcategory_id).toBe('groceries');
    expect(invalidatedKeys()).toEqual([`user:${USER_ID}:month:2026-10`]);
  });
});

describe('idempotency (ADR 0010)', () => {
  it('replaying the same event changes nothing and invalidates nothing', async () => {
    const id = randomUUID();
    const message = eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 10 });
    await handle(message);
    deps.invalidateSpendTotals.mockClear();

    expect(await handle(message)).toBe('unchanged');

    expect(await row(id)).toMatchObject({ amount: 10 });
    expect(deps.invalidateSpendTotals).not.toHaveBeenCalled();
  });

  it('a stale (older) update is skipped', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 10 }));
    await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(3), amount: 30 }));

    expect(await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(2), amount: 20 }))).toBe('unchanged');

    expect(await row(id)).toMatchObject({ amount: 30 });
  });

  it('two events 1 microsecond apart are still ordered correctly', async () => {
    // JS Dates only keep milliseconds - this is why created_at is passed
    // through as a string (ADR 0010).
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: '2026-10-27T10:00:00.123456Z', amount: 1 }));

    expect(
      await handle(eventMessage({ itemId: id, operation: 'update', createdAt: '2026-10-27T10:00:00.123457Z', amount: 2 }))
    ).toBe('applied');
    expect(await row(id)).toMatchObject({ amount: 2 });
  });
});

describe('tombstones (ADR 0009)', () => {
  it('a create after a delete is skipped', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 10 }));
    await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(2) }));

    expect(await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(3), amount: 99 }))).toBe('unchanged');

    expect(await row(id)).toMatchObject({ amount: 10 });
    expect((await row(id)).deleted_at).toBeInstanceOf(Date);
  });

  it('an update after a delete is skipped', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1) }));
    await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(2) }));

    expect(await handle(eventMessage({ itemId: id, operation: 'update', createdAt: at(3), amount: 99 }))).toBe('unchanged');
  });

  it('a delete before its create leaves a tombstone that blocks the create', async () => {
    const id = randomUUID();
    expect(await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(1) }))).toBe('applied');

    const tombstone = await row(id);
    expect(tombstone).toMatchObject({ subcategory_id: null, amount: null, transaction_date: null });
    expect(tombstone.deleted_at).toBeInstanceOf(Date);
    // No transaction_date yet, so no month to invalidate.
    expect(invalidatedKeys()).toEqual([]);

    expect(await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(2) }))).toBe('unchanged');
  });

  it('a second delete keeps the first deleted_at', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1) }));
    await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(2) }));
    const first = (await row(id)).deleted_at;

    expect(await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(3) }))).toBe('unchanged');
    expect((await row(id)).deleted_at).toEqual(first);
  });
});

describe('ownership (ADR 0014)', () => {
  const OWNER = 1;
  const OTHER = 2;

  async function ownedRow(amount = 10) {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(1), userId: OWNER, amount }));
    deps.invalidateSpendTotals.mockClear();
    return id;
  }

  it("another user's update goes to the DLQ and changes nothing", async () => {
    const id = await ownedRow(10);
    const message = eventMessage({ itemId: id, operation: 'update', createdAt: at(2), userId: OTHER, amount: 999 });

    expect(await handle(message)).toBe('dead-lettered');

    expect(deps.sendToDlq).toHaveBeenCalledWith(message, 0, 'wrong-owner', expect.stringContaining(`owned by user ${OWNER}`));
    expect(await row(id)).toMatchObject({ user_id: OWNER, amount: 10 });
    expect(deps.invalidateSpendTotals).not.toHaveBeenCalled();
  });

  it("a create reusing another user's id can't take over their row", async () => {
    const id = await ownedRow(10);

    expect(await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(2), userId: OTHER, amount: 999 }))).toBe(
      'dead-lettered'
    );
    expect(await row(id)).toMatchObject({ user_id: OWNER, amount: 10 });
  });

  it("another user's delete goes to the DLQ and doesn't delete", async () => {
    const id = await ownedRow();

    expect(await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(2), userId: OTHER }))).toBe('dead-lettered');
    expect((await row(id)).deleted_at).toBeNull();
  });

  it('a tombstone belongs to whoever deleted first - another user can\'t create on it', async () => {
    const id = randomUUID();
    await handle(eventMessage({ itemId: id, operation: 'delete', createdAt: at(1), userId: OWNER }));

    expect(await handle(eventMessage({ itemId: id, operation: 'create', createdAt: at(2), userId: OTHER }))).toBe('dead-lettered');
  });

  it("the owner's own duplicate is still just 'unchanged', not wrong-owner", async () => {
    const id = randomUUID();
    const message = eventMessage({ itemId: id, operation: 'create', createdAt: at(1), userId: OWNER });
    await handle(message);

    expect(await handle(message)).toBe('unchanged');
    expect(deps.sendToDlq).not.toHaveBeenCalled();
  });
});

describe('dead letter queue (TODO item 7)', () => {
  it('bad data (amount not a number) goes to the DLQ, nothing is written', async () => {
    const id = randomUUID();
    const message = eventMessage({ itemId: id, operation: 'create', createdAt: at(1), amount: 'abc' });

    expect(await handle(message)).toBe('dead-lettered');

    expect(deps.sendToDlq).toHaveBeenCalledWith(message, 0, 'bad-data', expect.objectContaining({ code: '22P02' }));
    expect(await row(id)).toBeUndefined();
  });

  it('an unparseable message goes to the DLQ', async () => {
    const message = rawMessage('{not json');

    expect(await handle(message)).toBe('dead-lettered');
    expect(deps.sendToDlq).toHaveBeenCalledWith(message, 0, 'unparseable', expect.any(SyntaxError));
  });

  it('an unknown operation goes to the DLQ', async () => {
    const id = randomUUID();
    const message = eventMessage({ itemId: id, operation: 'archive', createdAt: at(1) });

    expect(await handle(message)).toBe('dead-lettered');
    expect(deps.sendToDlq).toHaveBeenCalledWith(message, 0, 'unknown-operation', 'operation=archive');
    expect(await row(id)).toBeUndefined();
  });

  it('a non-insert change (op=d) goes to the DLQ', async () => {
    const message = eventMessage({ itemId: randomUUID(), operation: 'create', createdAt: at(1), op: 'd' });

    expect(await handle(message)).toBe('dead-lettered');
    expect(deps.sendToDlq).toHaveBeenCalledWith(message, 0, 'unexpected-change', 'op=d');
  });

  it('a Kafka tombstone (null value) is ignored, not dead-lettered', async () => {
    expect(await handle(rawMessage(null))).toBe('ignored');
    expect(deps.sendToDlq).not.toHaveBeenCalled();
  });

  it('a database outage is thrown (so kafkajs retries), not dead-lettered', async () => {
    const downPool = new Pool({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:1/none' });
    try {
      await expect(
        handleMessage({ ...deps, pool: downPool }, 0, eventMessage({ itemId: randomUUID(), operation: 'create', createdAt: at(1) }))
      ).rejects.toThrow();
      expect(deps.sendToDlq).not.toHaveBeenCalled();
    } finally {
      await downPool.end();
    }
  });

  it('if sending to the DLQ fails, the error is thrown so the event is retried, not lost', async () => {
    deps.sendToDlq.mockRejectedValue(new Error('kafka unavailable'));

    await expect(handle(rawMessage('{not json'))).rejects.toThrow('kafka unavailable');
  });
});
