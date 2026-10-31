import { createClient } from 'redis';

// spend-summary-cache. Optional by design (docs/adr/0011-spend-summary-cache-aside.md):
// if Redis is down, callers skip the cache and compute from transactions-db.
// disableOfflineQueue makes commands fail fast while disconnected, instead
// of queueing until Redis comes back (which would hang the request).
export const cache = createClient({
  url: process.env.REDIS_URL || 'redis://spend-summary-cache:6379',
  disableOfflineQueue: true,
});

// Without an error listener, a Redis disconnect would crash the process.
cache.on('error', (error) => console.error('spend-summary-cache error:', error.message));

// Not awaited: the service starts and serves (uncached) even if Redis isn't
// up yet - the client keeps reconnecting in the background.
cache.connect().catch((error) => console.error('spend-summary-cache connect failed:', error.message));

// Same key format db-writer-service deletes on every change - keep in sync.
export function monthKey(userId: number, month: string): string {
  return `user:${userId}:month:${month}`;
}
