import { Pool } from 'pg';
import { EventStoreRow, TransactionPayload } from './types/event';

// Each operation is one INSERT ... ON CONFLICT statement, so the idempotency
// check (last_event_at), the tombstone check (deleted_at), the ownership
// check (user_id), and the write itself all happen atomically - no separate
// lookup that could race. See docs/adr/0009-tombstones-as-deleted-at-column.md,
// docs/adr/0010-idempotency-via-last-event-at.md, and
// docs/adr/0014-transaction-ownership-in-db-writer.md.

// A (user, date) whose cached monthly spend total a change affected - see
// docs/adr/0011-spend-summary-cache-aside.md.
export interface TouchedSpend {
  userId: number;
  transactionDate: Date;
}

interface ReturnedRow {
  user_id: number;
  transaction_date: Date | null;
  old_transaction_date: Date | null;
}

// RETURNING only yields a row when the WHERE guard let the write through, so
// no rows means nothing changed (duplicate, stale, tombstoned, or someone
// else's row). The `old` CTE sees the row as it was before this statement,
// so both the month it was in and the month it's in now are returned - an
// update can move a transaction to another month. (Never to another user:
// the owner can't change, ADR 0014.)
function touched(rows: ReturnedRow[]): TouchedSpend[] {
  const result: TouchedSpend[] = [];
  for (const row of rows) {
    if (row.transaction_date) result.push({ userId: row.user_id, transactionDate: row.transaction_date });
    if (row.old_transaction_date) result.push({ userId: row.user_id, transactionDate: row.old_transaction_date });
  }
  return result;
}

// create and update are handled the same way: both carry the full
// transaction, so an update that arrives before its create still works.
async function upsert(pool: Pool, row: EventStoreRow): Promise<ReturnedRow[]> {
  const t: TransactionPayload = JSON.parse(row.payload);

  const result = await pool.query<ReturnedRow>(
    `WITH old AS (SELECT transaction_date FROM transactions WHERE id = $1)
     INSERT INTO transactions (id, user_id, subcategory_id, amount, description, transaction_date, last_event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       subcategory_id   = EXCLUDED.subcategory_id,
       amount           = EXCLUDED.amount,
       description      = EXCLUDED.description,
       transaction_date = EXCLUDED.transaction_date,
       last_event_at    = EXCLUDED.last_event_at
     WHERE transactions.deleted_at IS NULL
       AND transactions.last_event_at < EXCLUDED.last_event_at
       AND transactions.user_id = EXCLUDED.user_id
     RETURNING transactions.user_id, transactions.transaction_date,
               (SELECT transaction_date FROM old) AS old_transaction_date`,
    [row.item_id, row.user_id, t.subCategoryId, t.amount, t.description, t.transactionDate, row.created_at]
  );
  return result.rows;
}

// Deletes are final, regardless of event order: an already-deleted row is
// left alone (keeps its original deleted_at), and a delete for an id with no
// row yet still inserts a tombstone so a late create can't resurrect it.
// The row keeps its transaction_date, so RETURNING still says which month
// lost this transaction (a fresh tombstone has none - no month affected).
async function markDeleted(pool: Pool, row: EventStoreRow): Promise<ReturnedRow[]> {
  const result = await pool.query<ReturnedRow>(
    `INSERT INTO transactions (id, user_id, deleted_at, last_event_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (id) DO UPDATE SET
       deleted_at    = EXCLUDED.deleted_at,
       last_event_at = GREATEST(transactions.last_event_at, EXCLUDED.last_event_at)
     WHERE transactions.deleted_at IS NULL
       AND transactions.user_id = EXCLUDED.user_id
     RETURNING user_id, transaction_date, NULL::timestamptz AS old_transaction_date`,
    [row.item_id, row.user_id, row.created_at]
  );
  return result.rows;
}

// Only called when an event changed nothing, to tell "someone else's row"
// apart from the harmless duplicate/stale/tombstoned cases. The owner never
// changes once written, so this can't race the write it follows.
async function ownerOf(pool: Pool, itemId: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: number }>(`SELECT user_id FROM transactions WHERE id = $1`, [itemId]);
  return rows[0]?.user_id ?? null;
}

// 'unknown' is an operation this consumer doesn't handle, and 'wrong-owner'
// an event from a user who doesn't own the row - the caller sends both to
// the DLQ instead of retrying something that can never succeed.
export type ApplyResult =
  | { status: 'applied'; touched: TouchedSpend[] }
  | { status: 'unchanged' }
  | { status: 'wrong-owner'; ownerId: number }
  | { status: 'unknown' };

export async function applyOperation(pool: Pool, row: EventStoreRow): Promise<ApplyResult> {
  let rows: ReturnedRow[];
  switch (row.operation) {
    case 'create':
    case 'update':
      rows = await upsert(pool, row);
      break;
    case 'delete':
      rows = await markDeleted(pool, row);
      break;
    default:
      return { status: 'unknown' };
  }
  if (rows.length > 0) return { status: 'applied', touched: touched(rows) };

  const ownerId = await ownerOf(pool, row.item_id);
  return ownerId !== null && ownerId !== row.user_id ? { status: 'wrong-owner', ownerId } : { status: 'unchanged' };
}
