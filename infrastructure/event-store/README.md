# event-store

Insert-only Postgres table the API writes to instead of writing to `transactions-db` directly.

- One row per action (create/update/delete) — a "delete" is a new row saying so, never a real `DELETE`.
- Keyed by the item's own ID (not `userId`) — keeps create/delete for the same item in order without making one busy user a hot Kafka partition later on.
- Rows expire via daily-partition TTL (drop yesterday's whole partition), not row-by-row deletes — so CDC never mistakes routine cleanup for a real delete event.

Table schema (the "table creator") lives in `services/create-transaction-service/migrations/1700000000001_event_store.js` — `create-transaction-service` owns and applies it (`yarn --cwd services/create-transaction-service migrate:up`), since it's the service that writes to `event_store`.

Partition TTL cleanup is handled by `services/create-transaction-service/src/scripts/manage-partitions.ts`, which creates tomorrow's partition ahead of time and drops any partition older than 1 day. It runs once a day via the `event-store-partition-manager` CronJob in `k8s/event-store-partition-manager.yaml`. CDC (Debezium) watches this table and forwards every new row to Kafka — see `infrastructure/cdc/README.md`.

See root `README.md` Architecture section for the full diagram.
