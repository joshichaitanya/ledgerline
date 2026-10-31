# 10. Idempotent apply via a `last_event_at` check on each row, not a processed-events table

**Status:** Accepted (see `services/db-writer-service`)

**Context:** Kafka delivers at-least-once, so the Operation consumer (`db-writer-service`) will sometimes see the same event twice. This happens, for example, when it crashes after writing to `transactions-db` but before committing its Kafka offset. Applying the same event again must not change the result. There were two options: (A) store the `event_store.created_at` of the last applied event on each `transactions` row (`last_event_at`), and only apply an event if it's newer; or (B) record every applied event id in a `processed_events` table and skip ids already in it.

**Decision:** Option A. `create` and `update` are both an upsert guarded by `WHERE transactions.last_event_at < EXCLUDED.last_event_at`. A replayed event has the same timestamp, not a newer one, so it's skipped.

`create` and `update` are handled the same way (upsert), because both carry the full transaction. That means an update arriving before its create still produces the right row.

**Consequences:**
- No extra table, and nothing that grows forever just to remember which events were seen.
- It also blocks a *stale* event from overwriting a newer one. A processed-events table alone wouldn't: it only knows "seen or not", not "older or newer".
- `last_event_at` is passed through as Debezium's ISO string (microsecond precision), not converted to a JS `Date`, which only keeps milliseconds. Two events for the same item in the same millisecond would otherwise look equal, and the second would be wrongly skipped.
- It relies on `event_store.created_at` (Postgres `now()` at insert time) increasing for later events on the same item. All writes go to one `event_store-db`, so this holds in practice. The one gap: `now()` is the transaction's *start* time, so two writes to the same item racing within microseconds could commit in the opposite order from their timestamps. That's an accepted edge case. Per-item order on Kafka ([0004](0004-kafka-key-item-id.md)) already makes it rare.
