# db-writer-service

The **Operation consumer**: reads every `event_store` change that Debezium publishes to the `event_store.public.event_store` Kafka topic (see `infrastructure/cdc/`) and applies it into `transactions-db`.

- `create` / `update` → upsert the full transaction into `transactions`. Both carry the full transaction, so an update arriving before its create still works.
- `delete` → set `transactions.deleted_at` (a tombstone). Deletes are final. Any later create/update for that id is skipped, so a late create can't bring a deleted item back. See [ADR 0009](../../docs/adr/0009-tombstones-as-deleted-at-column.md).
- **Idempotent**: each row stores the `event_store.created_at` of the last event applied to it (`last_event_at`). An event is only applied if it's newer, so a replayed (or stale) event changes nothing. See [ADR 0010](../../docs/adr/0010-idempotency-via-last-event-at.md).
- **Owner-checked**: an event only changes a row that's new or already belongs to the event's user, so a transaction's owner never changes. Another user's create/update/delete for it goes to the DLQ as `wrong-owner`. See [ADR 0014](../../docs/adr/0014-transaction-ownership-in-db-writer.md).

Each operation is one `INSERT ... ON CONFLICT` statement (`src/apply-operation.ts`), so the checks and the write happen together, with nothing that can race between them.

After a change is applied, it deletes the cached monthly spend totals in `spend-summary-cache` for the month the row was in before *and* after the change (`src/spend-summary-cache.ts`; see [ADR 0011](../../docs/adr/0011-spend-summary-cache-aside.md)). A Redis failure is logged, never thrown, so the cache can't stall the pipeline. Keys it couldn't delete are remembered and deleted when Redis reconnects, so a Redis outage doesn't leave stale totals behind (unless this consumer also restarts during the outage — then the 1h TTL is the backstop).

**Anything reading `transactions` must filter `WHERE deleted_at IS NULL`.**

## Code

- `src/index.ts`: wiring only — Kafka consumer (`eachMessage`, group `db-writer-service`), DLQ producer, Redis, clean shutdown.
- `src/handle-message.ts`: what happens to one message — unwraps Debezium's change event (`op`, `after`), applies it, and decides between applied / no change / DLQ / throw (retry). Takes the database, DLQ sender, and cache invalidation as arguments, so tests can pass fakes.
- `src/apply-operation.ts`: branches on `operation` and runs the right SQL.
- `src/dlq.ts`: creates the DLQ topic and sends dead-lettered events to it.
- `src/spend-summary-cache.ts`: deletes cached spend totals, and catches up on missed deletes after a Redis outage.
- `migrations/transactions/`: the `transactions` table, plus `deleted_at`/`last_event_at` (`1700000000001_transactions_apply_state.js`), plus `subcategory_id` changed from `uuid` to `text` (`1700000000002_transactions_subcategory_id_text.js`), because the app sends mock ids like `'groceries'`, not uuids, until real categories exist (`docs/TODO.md` item 9).

## Error handling

- **Events that can never succeed go to the dead letter queue**, `event_store.public.event_store.dlq`, and the consumer moves on. Retrying them would never work and would block the partition. That's:
  - `bad-data`: Postgres rejected the data (error classes `22` data exception / `23` constraint violation, e.g. `amount: "abc"`), or the `payload` isn't valid JSON
  - `unparseable`: the Kafka message itself isn't valid JSON
  - `unknown-operation`: `operation` isn't `create`/`update`/`delete`
  - `unexpected-change`: Debezium `op` isn't an insert (`c`) or snapshot read (`r`) — `event_store` is insert-only
  - `wrong-owner`: the event's user doesn't own that transaction (ADR 0014)
- A DLQ message keeps the original key and value unchanged, so a fixed event can be re-published to the source topic as-is. Headers say why and where from: `dlq-reason`, `dlq-error`, `dlq-source-topic`, `dlq-source-partition`, `dlq-source-offset`, `dlq-failed-at`.
- The DLQ topic is created on startup with `retention.ms=-1` (kept forever). Kafka's default 7-day retention would delete exactly the events the DLQ exists to keep.
- **Errors that might fix themselves are thrown** (e.g. DB down, or sending to the DLQ failing). kafkajs retries with backoff, and if retries run out the consumer crashes and `restart: always` redelivers from the last committed offset. This is safe because applying is idempotent. There's deliberately no "retry N times, then DLQ": that would dead-letter every event during a short database outage.
- A Kafka tombstone (null value) is ignored. Debezium only sends one after a real row `DELETE`, which `event_store` never does.

To read the DLQ:

```
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic event_store.public.event_store.dlq --from-beginning --property print.headers=true
```
- Each event is logged as either `Applied …` or `No change from … - duplicate, stale, or tombstoned` (the SQL's guard skipped it), so a replay is easy to tell apart from real changes.
- On `SIGTERM`/`SIGINT` it leaves the Kafka group cleanly, so its partitions move to another replica right away instead of after the ~30s session timeout. `docker-compose.yml` gives it `stop_grace_period: 15s` for this (Docker on the dev machine defaulted to 1s, which killed it mid-disconnect).

## Testing it

```
yarn --cwd services/db-writer-service test
```

Vitest, against a throwaway Postgres (Testcontainers, so Docker must be running) with the real `migrations/transactions/` applied: every apply case (newer wins, stale, replay, tombstones in every order, month/user moves), every DLQ path, and the Redis catch-up logic. See `docs/TODO.md` items 4, 6 and 7.

To replay every event on the live topic by hand (should change nothing):

```
docker compose stop db-writer-service
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group db-writer-service --topic event_store.public.event_store --reset-offsets --to-earliest --execute
docker compose start db-writer-service
```

The reset is refused while the group still has a member. If it says so, wait a few seconds and try again.

## Running locally

```
docker compose up -d --build
```

The `transactions` migrations run automatically first, in the one-off `transactions-migrate` container (k8s: this Deployment's `migrate` init container), using this service's own image.

The `event_store.public.event_store` topic is only created when Debezium publishes its first event (Kafka's auto topic creation is off). So on a clean slate this service crash-restarts until the first transaction is posted. `restart: always` covers that.

## Not done yet

- `user_id`/`subcategory_id` aren't checked against `reference-db` (see the comment in the first `transactions` migration). Postgres can't enforce that across databases.
- Tombstone rows are never cleaned up (see ADR 0009).
