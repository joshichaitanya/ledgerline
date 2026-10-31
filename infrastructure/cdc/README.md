# cdc

Change Data Capture: watches `event-store`'s write-ahead log and publishes every new row to Kafka, keyed by item id.

Tool: Debezium's Postgres connector, running inside Kafka Connect.

## What's set up

- `docker-compose.yml`: `event-store-db` runs with `wal_level=logical` (needed for Debezium to read the WAL), and a `kafka-connect` service (`debezium/connect`) is wired up to Kafka and to `event-store-db` directly (not through pgbouncer — logical replication needs a real, long-lived connection, which pgbouncer's transaction pooling mode doesn't support).
- `prepare-publication.sql` + the `event-store-publication-init` step (`docker-compose.yml`) / init container (`k8s/kafka-connect.yaml`): sets `publish_via_partition_root` on the publication *before* the connector starts. This turned out to be required, not optional — see the gotcha below.
- `event-store-connector.json`: the connector config. Watches the `event_store` table (all its daily/hash partitions) and publishes to a topic named `event_store.public.event_store`.
  - `message.key.columns` sets the Kafka message key to `item_id`. Without it, Debezium would default to the table's real primary key (`id, created_at, item_id` — see the migration), which isn't what we want to partition/key by (see [ADR 0004](../../docs/adr/0004-kafka-key-item-id.md)).
- `register-connector.sh`: puts that config into Kafka Connect's REST API (`PUT /connectors/event-store-connector/config`) — Connect doesn't pick up the JSON file on its own. Uses `PUT` (not `POST`) so it's safe to re-run — registers the connector if it's missing, updates it if it's already there.
- Nobody needs to run that script by hand: `docker-compose.yml` has a `kafka-connect-register` one-off container that runs it on every `docker compose up`, once Kafka Connect is healthy. In k8s, a `connector-registrar` container in the `kafka-connect` pod keeps it registered — it re-registers whenever the connector is missing or the ConfigMap's config changed (checked every 30s), so a config change needs only `kubectl apply`, no Job to delete and re-run. The publication step runs as that pod's `prepare-publication` init container, after waiting for the `event_store` table.

## Gotcha: `publish_via_partition_root` isn't a real Debezium property

An earlier version of `event-store-connector.json` had `"publish.via.partition.root": "true"` in it, based on the assumption Debezium's Postgres connector exposes this as a config property. **It doesn't** — that key was silently ignored, and rows inserted into `event_store` never reached Kafka at all (confirmed by testing: `pg_publication.pubviaroot` stayed `false` no matter what the connector config said).

Without it set, changes to a partitioned table's rows arrive tagged with the *partition's* name (e.g. `event_store_default`, `event_store_2026_09_13_0`) — not `event_store` — so the connector's `table.include.list: "public.event_store"` never matches them, and they're dropped silently (no error anywhere).

The fix has to happen on Postgres's side directly: `ALTER PUBLICATION ... SET (publish_via_partition_root = true)` (or set it at `CREATE PUBLICATION` time). That's what `prepare-publication.sql` does, run once before the connector is registered.

## Verified working

Tested end-to-end: posted a transaction via `create-transaction-service`, confirmed the row landed in `event_store`, and confirmed it showed up on the `event_store.public.event_store` Kafka topic, keyed by `item_id`, with `table: "event_store"` in the payload (not a partition name) — the fix above is what made this actually work.

## Not done yet

- Nothing left for the CDC side itself. The Operation consumer that reads this topic (`services/db-writer-service`) is built and tested end-to-end — see `docs/TODO.md` item 4.
- Kafka's default 7-day retention applies to this topic. Events older than that are gone from Kafka (still in `event_store` until its own TTL), so a consumer that's been down longer than a week, or a fresh consumer group, can't replay them from the topic.

See root `README.md` Architecture section for the full diagram.
