import { createClient } from 'redis';
import { TouchedSpend } from './apply-operation';

// Deletes cached monthly spend totals a change affected, so the next read
// recomputes them - see docs/adr/0011-spend-summary-cache-aside.md.
//
// Never throws: the cache isn't the source of truth, so a Redis outage must
// not stall the Kafka pipeline. Keys it couldn't delete are remembered and
// deleted as soon as Redis is back, so a total doesn't stay stale for its
// whole 1h TTL after an outage. That memory is in-process only - if this
// consumer restarts mid-outage, the TTL (set by get-transactions-service)
// is still the backstop.

// Just the parts of the redis client this needs, so tests can pass a fake
// that goes down and comes back on demand.
export interface InvalidationClient {
  readonly isReady: boolean;
  del(keys: string[]): Promise<number>;
}

// A long outage with many distinct users/months touched could grow the
// pending set without bound - past this, new keys are left to their TTL.
const MAX_PENDING_KEYS = 10_000;

// Same key format get-transactions-service reads - keep in sync. Months are UTC.
export function monthKey(userId: number, transactionDate: Date): string {
  return `user:${userId}:month:${transactionDate.toISOString().slice(0, 7)}`;
}

export class SpendTotalsInvalidator {
  private pending = new Set<string>();

  constructor(private cache: InvalidationClient) {}

  get pendingKeys(): string[] {
    return [...this.pending];
  }

  async invalidate(touched: TouchedSpend[]) {
    for (const key of new Set(touched.map((t) => monthKey(t.userId, t.transactionDate)))) {
      if (this.pending.size >= MAX_PENDING_KEYS && !this.pending.has(key)) {
        console.error(`spend-summary-cache: ${MAX_PENDING_KEYS} keys already pending, leaving ${key} to its TTL`);
        continue;
      }
      this.pending.add(key);
    }
    await this.flush();
  }

  // Deletes every pending key - this change's, plus any left over from
  // while Redis was down. Called again by the client's 'ready' event.
  async flush() {
    if (this.pending.size === 0) return;

    const keys = [...this.pending];
    if (!this.cache.isReady) {
      console.error(`spend-summary-cache not connected, ${keys.length} invalidation(s) pending until it is: ${keys.join(', ')}`);
      return;
    }
    try {
      await this.cache.del(keys);
      for (const key of keys) this.pending.delete(key);
    } catch (error) {
      console.error(`spend-summary-cache invalidate failed, ${keys.length} kept pending:`, error);
    }
  }
}

// disableOfflineQueue makes commands fail fast while disconnected, instead
// of queueing until Redis comes back (which would stall this partition).
const cache = createClient({
  url: process.env.REDIS_URL || 'redis://spend-summary-cache:6379',
  disableOfflineQueue: true,
});

const invalidator = new SpendTotalsInvalidator(cache);

// Without an error listener, a Redis disconnect would crash the process.
cache.on('error', (error) => console.error('spend-summary-cache error:', error.message));
// Fires on first connect and on every reconnect - catch up on missed deletes.
cache.on('ready', () => void invalidator.flush());

export async function connectCache() {
  // Not fatal if Redis isn't up yet - the client keeps reconnecting in the background.
  await cache.connect().catch((error) => console.error('spend-summary-cache connect failed:', error.message));
}

export async function disconnectCache() {
  if (cache.isOpen) await cache.quit();
}

export function invalidateSpendTotals(touched: TouchedSpend[]) {
  return invalidator.invalidate(touched);
}
