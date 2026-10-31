# 5. Event-store is insert-only — a delete is a new row, never a real `DELETE`

**Status:** Accepted (target design — not yet built, see README)

**Context:** CDC forwards every write it sees in the WAL as a change event. If a real application-level "delete this transaction" were done as an actual SQL `DELETE`, CDC would have no way to tell it apart from a `DELETE` caused by routine TTL cleanup (see [ADR 3](0003-event-store-ttl-via-partition-drop.md)) — both look identical in the WAL.

**Decision:** `event_store` never runs `DELETE` for application reasons. Deleting a transaction is represented as a new row with `operation = 'delete'`, referencing the same item ID. The only real `DELETE`s the table ever sees are whole-partition drops for TTL.

**Consequences:** CDC can safely treat every row it sees as a genuine, meaningful change — there's no ambiguity to resolve. Downstream, the "Operation" consumer has to actually interpret the `operation` column (apply, or remove from `transactions-db`) rather than relying on SQL delete semantics, and it must be tombstone-aware so a late-arriving "create" can't resurrect something that was already deleted.
