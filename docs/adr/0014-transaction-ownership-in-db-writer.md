# 14. Transaction ownership is enforced in `db-writer-service`; wrong-owner events go to the DLQ

**Status:** Accepted (see `services/db-writer-service`)

**Context:** Even with `userId` taken from the token ([ADR 0013](0013-user-id-from-verified-token.md)), nothing checked that the user changing a transaction *owns* it. `db-writer-service`'s upsert would happily overwrite a row that belonged to someone else, and even move it to the new user. Transaction ids are chosen by the client ([ADR 0001](0001-client-generated-transaction-id.md)), so a "create" that reused another user's id would overwrite their row too. The write services can't check this themselves. They only append to `event_store` and never read `transactions-db`, and the row may not even exist yet when the event is written.

**Decision:** `db-writer-service` only applies an event if the row doesn't exist yet, or already belongs to the event's user (`transactions.user_id = EXCLUDED.user_id` in both SQL guards). A transaction's owner therefore never changes after it's first written. When an event is skipped and the row belongs to someone else, the event goes to the DLQ with reason `wrong-owner` ([TODO item 7](../TODO.md)), rather than being silently dropped.

**Consequences:**
- A user can't change, delete, or take over another user's transaction, whatever id they send.
- The API still answers `202 Accepted` for such a request, because it can't know yet. The rejection only shows up later, in the DLQ. That's acceptable, because the request was never legitimate. A normal user going through the web app never hits this.
- The ownership check is part of the same single SQL statement as the idempotency and tombstone checks ([ADR 0009](0009-tombstones-as-deleted-at-column.md), [ADR 0010](0010-idempotency-via-last-event-at.md)), so there's still nothing that can race. Telling "wrong owner" apart from "duplicate/stale/tombstoned" takes one extra lookup, and only when an event changed nothing.
- The first event to write a given id decides its owner, including a delete that arrives first and leaves a tombstone.
