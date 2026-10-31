import { pool } from '../db';
import { Transaction } from '../types/transaction';

interface TransactionRow {
  id: string;
  user_id: number;
  subcategory_id: string;
  // numeric comes back from pg as a string, to avoid losing precision.
  amount: string;
  description: string | null;
  transaction_date: Date;
}

export async function getTransactionsForUser(userId: number): Promise<Transaction[]> {
  // deleted_at IS NULL: deleted transactions stay in the table as tombstones
  // (docs/adr/0009-tombstones-as-deleted-at-column.md), they must never be returned.
  const { rows } = await pool.query<TransactionRow>(
    `SELECT id, user_id, subcategory_id, amount, description, transaction_date
     FROM transactions
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY transaction_date DESC`,
    [userId]
  );

  return rows.map((row) => ({
    transactionId: row.id,
    userId: row.user_id,
    subCategoryId: row.subcategory_id,
    amount: Number(row.amount),
    description: row.description ?? '',
    transactionDate: row.transaction_date.toISOString(),
  }));
}
