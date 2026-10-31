# 7. Use an off-the-shelf CDC tool (Debezium + Kafka Connect), not a custom service

**Status:** Accepted (target design — see `infrastructure/cdc/`)

**Context:** Once the API writes to `event_store` first ([0002](0002-event-store-before-kafka.md)), something still needs to notice new rows and publish them to Kafka. That "something" could be a custom service we write ourselves — e.g. polling the table on a timer, or listening for `NOTIFY` events — or an existing CDC tool like Debezium that reads Postgres's write-ahead log directly.

**Decision:** Use Debezium's Postgres connector, running inside Kafka Connect, instead of writing our own watcher service. It reads the WAL directly and publishes to Kafka — no application code needed, just a config file telling it which table to watch (`infrastructure/cdc/event-store-connector.json`).

**Consequences:**
- Less code to write and maintain: no polling loop, no "have I seen this row before" bookkeeping, no service to deploy/scale/monitor on our own.
- Reading the WAL directly means every committed row is caught in order, with no gaps and no missed rows between polls — a custom polling service would need to get that right itself (e.g. handling rows inserted out of primary-key order).
- The cost is an extra piece of infrastructure we don't control the internals of: Kafka Connect itself needs running and monitoring, and debugging a stuck connector means learning Debezium/Kafka Connect's own tooling (REST API, logs) instead of just reading our own code.
- Postgres config changes are needed to support it (`wal_level=logical`, replication slots) — a small but real operational requirement that a custom polling service wouldn't need.
