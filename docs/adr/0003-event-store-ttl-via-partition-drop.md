# 3. Event-store rows expire via daily-partition drop, not row-by-row DELETE

**Status:** Accepted (target design — not yet built, see README)

**Context:** `event_store` is meant to hold only a rolling window of recent history (CDC has already forwarded anything older). Regularly deleting old rows one by one would work, but CDC watches the write-ahead log and can't tell the difference between "this row was deleted because a user deleted their transaction" and "this row was deleted because it's just old and expired."

**Decision:** Rows expire by dropping the entire partition they live in (one partition per day) once it's outside the retention window, instead of a `DELETE ... WHERE created_at < ...` query. See `services/create-transaction-service/src/scripts/manage-partitions.ts`.

**Consequences:** CDC never has to distinguish routine cleanup from a real delete, because a dropped partition never appears as a row-level `DELETE` event in the WAL at all — it's a DDL operation. Dropping a whole partition is also far cheaper than deleting millions of individual rows. The tradeoff is coarser granularity: retention is "whole days," not "this exact row's age," and a scheduled job (the CronJob in `k8s/event-store-partition-manager.yaml`) must keep creating tomorrow's partition ahead of time or writes start falling into the catch-all `DEFAULT` partition.
