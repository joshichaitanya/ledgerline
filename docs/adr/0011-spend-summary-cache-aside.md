# 11. Spend totals cached cache-aside (invalidate on write), monthly only

**Status:** Accepted (see `services/get-transactions-service` and `services/db-writer-service`)

**Context:** The reports pages need spend totals per month (by subcategory, and per month across a year). Before this, the web app downloaded every transaction and added them up in the browser. `spend-summary-cache` (Redis) is there to hold pre-computed totals instead. There were two ways to keep it correct: (A) **cache-aside**: the reader computes a missing total from `transactions-db` and stores it, and `db-writer-service` deletes the cached totals a change affects; or (B) `db-writer-service` adds and subtracts each event's amount from the cached total as events arrive.

**Decision:** Option A, caching **monthly totals only**, keyed `user:{userId}:month:{YYYY-MM}`. The value is a JSON object of subcategory → total, e.g. `{"groceries":120.5,"fuel":60}`.

- `GET /transactions/summary` (`get-transactions-service`) reads the months it needs with one `MGET`. It works out any missing ones with a single SQL `SUM ... GROUP BY` over `transactions-db`, and stores them.
- When `db-writer-service` changes a row, it deletes the cached month the row was in *and* the month it's in now. An update can move a transaction to a different month, or even to a different user.
- Months are UTC calendar months.

**Consequences:**
- **Replays stay harmless.** Deleting a cache key twice is the same as deleting it once. Option B would have counted a replayed event twice, undoing the idempotency [ADR 0010](0010-idempotency-via-last-event-at.md) gives `transactions-db`.
- **The cache is never the source of truth.** It can be flushed at any time and refills itself on the next read, so there's nothing to backfill or migrate.
- **Daily totals aren't cached**, because nothing shows them yet. A daily key can be added later the same way, and it fills itself on first read.
- **Redis being down never blocks anything.** The reader falls back to computing from `transactions-db`. `db-writer-service` logs a failed delete and carries on, rather than stalling the Kafka pipeline over a cache.
- **Deletes missed during a Redis outage are caught up.** Redis keeps its data on disk, so a total cached before an outage survives it. If the change's delete failed meanwhile, that total would be wrong when Redis comes back (seen in testing). So `db-writer-service` remembers keys it couldn't delete and deletes them on reconnect. That memory is in-process only, capped at 10,000 keys.
- **A stale total can still happen**, in these cases: the consumer restarts during a Redis outage (its pending deletes are lost); a crash between the `transactions-db` write and the delete (the redelivered event then changes nothing, so it deletes nothing); or the usual cache-aside race (a reader computes a total just before a change, and stores it just after that change's delete). So every key also expires after **1 hour**. That caps how long a wrong total can last.
- **Month boundaries are UTC.** The web app used to group by the browser's local time, so a transaction near midnight at a month's end can now land in the neighbouring month for users far from UTC.
