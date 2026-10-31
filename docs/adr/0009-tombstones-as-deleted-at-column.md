# 9. Tombstones live on the `transactions` row itself (`deleted_at`), not in a separate table

**Status:** Accepted (see `services/db-writer-service`)

**Context:** A delete in `event_store` is a new row, not a real `DELETE` ([0005](0005-event-store-insert-only.md)), and the Operation consumer (`db-writer-service`) must not let a create or update that arrives *after* a delete bring the item back. To do that, `transactions-db` has to remember that an item was deleted. There were two options: (A) keep the row in `transactions` and mark it with a `deleted_at` column, or (B) really delete the row from `transactions` and keep a separate `transaction_tombstones` table that the consumer checks first.

**Decision:** Option A. A delete event sets `transactions.deleted_at`, and any create/update for a row whose `deleted_at` is set is skipped. Deletes are final: once set, `deleted_at` is never cleared.

A delete can arrive for an id that has no row yet (e.g. the create was never seen, or a client deleted before its create landed). The consumer still inserts a row then, carrying just `id`, `user_id`, and `deleted_at`, so the later create has something to be blocked by. To allow that, `subcategory_id`/`amount`/`transaction_date` are now nullable, but a `CHECK` constraint keeps them required on every row that isn't deleted. Live rows keep the same guarantee they had before.

**Consequences:**
- One table, one statement per event. The tombstone check is part of the same `INSERT ... ON CONFLICT` that applies the change, so there's no separate lookup to keep in sync.
- **Every reader of `transactions` must filter `WHERE deleted_at IS NULL`.** Nothing reads this table yet (`get-transactions-service` still serves mock data), but whatever reads it next has to remember this.
- Deleted rows are never cleaned up, so the table only grows. That's fine at demo scale. A real deployment would eventually want a cleanup job that removes tombstones once they're old enough that no late event for that id can still arrive.
