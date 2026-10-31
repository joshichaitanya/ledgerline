import { pool } from '../db';
import { cache, monthKey } from '../cache';

// Cache-aside monthly spend totals - see docs/adr/0011-spend-summary-cache-aside.md.

// Caps how long a stale total can survive (a missed invalidation while Redis
// was down, or a read racing a write) - not the main way totals get refreshed.
const CACHE_TTL_SECONDS = 60 * 60;

export interface MonthSummary {
  month: string; // 'YYYY-MM', UTC
  bySubcategory: Record<string, number>;
}

interface TotalRow {
  month: string;
  subcategory_id: string;
  total: string; // numeric comes back from pg as a string
}

async function readCached(userId: number, months: string[]): Promise<(string | null)[]> {
  if (!cache.isReady) return months.map(() => null);
  try {
    return await cache.mGet(months.map((m) => monthKey(userId, m)));
  } catch (error) {
    console.error('spend-summary-cache read failed, computing from transactions-db:', error);
    return months.map(() => null);
  }
}

async function writeCached(userId: number, summaries: MonthSummary[]) {
  if (!cache.isReady || summaries.length === 0) return;
  try {
    const multi = cache.multi();
    for (const s of summaries) {
      multi.set(monthKey(userId, s.month), JSON.stringify(s.bySubcategory), { EX: CACHE_TTL_SECONDS });
    }
    await multi.exec();
  } catch (error) {
    console.error('spend-summary-cache write failed:', error);
  }
}

// One query for all the missing months, over the whole range they span -
// months in that range that aren't missing are just filtered out below.
async function computeFromDb(userId: number, months: string[]): Promise<MonthSummary[]> {
  const sorted = [...months].sort();
  const start = `${sorted[0]}-01T00:00:00Z`;
  const [lastYear, lastMonth] = sorted[sorted.length - 1].split('-').map(Number);
  const end = new Date(Date.UTC(lastYear, lastMonth, 1)).toISOString(); // first instant after the last month

  const { rows } = await pool.query<TotalRow>(
    `SELECT to_char(transaction_date AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
            subcategory_id,
            SUM(amount) AS total
     FROM transactions
     WHERE user_id = $1 AND deleted_at IS NULL
       AND transaction_date >= $2 AND transaction_date < $3
     GROUP BY 1, 2`,
    [userId, start, end]
  );

  const byMonth = new Map<string, Record<string, number>>(months.map((m) => [m, {}]));
  for (const row of rows) {
    const totals = byMonth.get(row.month);
    if (totals) totals[row.subcategory_id] = Number(row.total);
  }
  return months.map((month) => ({ month, bySubcategory: byMonth.get(month)! }));
}

export async function getMonthlySummaries(userId: number, months: string[]): Promise<MonthSummary[]> {
  const cached = await readCached(userId, months);

  const missing = months.filter((_, i) => cached[i] === null);
  const computed = missing.length > 0 ? await computeFromDb(userId, missing) : [];
  await writeCached(userId, computed);

  const computedByMonth = new Map(computed.map((s) => [s.month, s]));
  return months.map((month, i) =>
    cached[i] !== null ? { month, bySubcategory: JSON.parse(cached[i]!) } : computedByMonth.get(month)!
  );
}
