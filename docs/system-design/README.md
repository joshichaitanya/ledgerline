# System design

The high-level design of Ledgerline (an event-driven expense tracker), in one place. Each file is short and links to the ADRs in [`docs/adr/`](../adr/README.md) for the "why".

![High-level system design](architecture.svg)

## Files

| File | What it covers |
|---|---|
| [`architecture.svg`](architecture.svg) | The diagram above. |
| [`01-functional-requirements.md`](01-functional-requirements.md) | What the system does for a user. |
| [`02-non-functional-requirements.md`](02-non-functional-requirements.md) | How well it must do it: scale, ordering, consistency, security. |
| [`03-database-design.md`](03-database-design.md) | The four Postgres databases, Redis and Kafka topics, at table level. |
| [`04-api-design.md`](04-api-design.md) | Every endpoint, grouped by service. Full spec in [`../openapi.yaml`](../openapi.yaml). |
| [`deep-dives/`](deep-dives/) | The parts worth explaining in detail. |

## Deep dives

1. [Write path: event store + CDC instead of dual writes](deep-dives/01-write-path-event-store-cdc.md)
2. [Ordering, idempotency, tombstones and ownership in `db-writer-service`](deep-dives/02-consumer-correctness.md)
3. [Event-store partitioning and TTL](deep-dives/03-event-store-partitioning-ttl.md)
4. [Spend summary cache (cache-aside)](deep-dives/04-spend-summary-cache.md)
5. [Auth, tokens and the gateway](deep-dives/05-auth-and-gateway.md)

## The design in five lines

1. Every request goes through **Kong**, which checks the JWT, rate-limits per IP and handles CORS.
2. Transaction **writes** only append a row to an insert-only **event store** and answer `202 Accepted`.
3. **Debezium** reads the event store's write-ahead log and publishes each row to **Kafka**, keyed by the transaction id.
4. **`db-writer-service`** applies each event into **`transactions-db`** safely (duplicates, out-of-order and wrong-owner events can't break it) and clears cached totals in **Redis**.
5. **Reads** come from `transactions-db` and Redis. Categories and auth are plain synchronous CRUD on their own databases.
