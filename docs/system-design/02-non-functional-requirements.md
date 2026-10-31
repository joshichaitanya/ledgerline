# Non-functional requirements

How well the system must work. This is a learning project that runs on one laptop and has **not** been load-tested, so the targets below describe what the design is built to allow, not measured numbers.

## Scalability

| # | Requirement | How the design meets it |
|---|---|---|
| NFR-1 | Writes must scale out on their own. | Create / update / delete are three separate stateless services. Each does one `INSERT` into `event_store`, so each can be scaled independently. |
| NFR-2 | Reads must scale apart from writes. | Writes go to `event-store-db`; reads come from `transactions-db` and Redis (CQRS-style split). |
| NFR-3 | No single busy user should create a hot spot. | Kafka key and event-store hash buckets use the **item id**, not the user id ([ADR 0004](../adr/0004-kafka-key-item-id.md), [ADR 0006](../adr/0006-event-store-hash-split-partitions.md)). |
| NFR-4 | Many short app connections must not exhaust Postgres. | `pgbouncer` pools connections in front of `event-store-db`. |
| NFR-5 | The event store must not grow forever. | Daily partitions, dropped after 1 day ([ADR 0003](../adr/0003-event-store-ttl-via-partition-drop.md)). |

## Consistency and correctness

| # | Requirement | How the design meets it |
|---|---|---|
| NFR-6 | The event store and Kafka must never disagree (no dual write). | APIs only write to Postgres. Debezium reads the WAL and publishes ([ADR 0002](../adr/0002-event-store-before-kafka.md), [ADR 0007](../adr/0007-cdc-tool-vs-custom-service.md)). |
| NFR-7 | Changes to the same transaction are applied in order. | Kafka key = `item_id`, so one item's events stay in one partition. |
| NFR-8 | Duplicates and replays must not change the result. | `last_event_at` guard on every upsert ([ADR 0010](../adr/0010-idempotency-via-last-event-at.md)). |
| NFR-9 | A delete is final, even if it arrives before the create. | Tombstone row with `deleted_at` ([ADR 0009](../adr/0009-tombstones-as-deleted-at-column.md)). |
| NFR-10 | Reads are **eventually consistent** with writes. | Writes return `202`; the change shows up after CDC → Kafka → `db-writer-service` (normally well under a second locally). |
| NFR-11 | Cached totals are never wrong for long. | Cache cleared on every change, plus a 1 hour TTL as a safety net ([ADR 0011](../adr/0011-spend-summary-cache-aside.md)). |

## Availability and resilience

| # | Requirement | How the design meets it |
|---|---|---|
| NFR-12 | Writes keep working if Kafka or the consumer is down. | Writes only need `event-store-db`. Events wait in the WAL / Kafka and are applied later. |
| NFR-13 | Redis being down must not block anything. | Reader falls back to SQL; consumer logs failed cache deletes and retries them on reconnect. |
| NFR-14 | One bad event must not stop the pipeline. | Events that can never apply go to a **DLQ** with a reason header. Errors that may fix themselves (DB down) keep retrying. |
| NFR-15 | Each service can restart or deploy alone. | One container per service, health checks on all, k8s Deployments. |

## Security

| # | Requirement | How the design meets it |
|---|---|---|
| NFR-16 | Only logged-in users reach user data. | JWT checked at Kong **and** again in each service (`toolkit`'s `requireAuth`). |
| NFR-17 | A user can't act as someone else. | `userId` always comes from the verified token, never from the body ([ADR 0013](../adr/0013-user-id-from-verified-token.md)). |
| NFR-18 | A user can't take over another user's transaction. | Owner check inside `db-writer-service`'s upsert ([ADR 0014](../adr/0014-transaction-ownership-in-db-writer.md)). |
| NFR-19 | Stolen tokens have limited value. | Access token lives 15 min. Refresh token is httpOnly, rotated on each use, and revocable. |
| NFR-20 | Abuse is limited at the edge. | Per-IP rate limit in Kong, counters shared in Redis ([ADR 0016](../adr/0016-rate-limit-per-client-ip.md)). |

## Operability

| # | Requirement | How the design meets it |
|---|---|---|
| NFR-21 | Runs the same way locally and on k8s. | `docker-compose.yml` and `k8s/` manifests. Migrations and CDC registration run automatically. |
| NFR-22 | Every choice is explained. | One ADR per decision in `docs/adr/`. |
| NFR-23 | Changes are tested against real infra. | Vitest + Testcontainers (real Postgres/Redis), Playwright E2E with axe accessibility checks. |

## Known gaps

- Not load-tested.
- Kong can't see the real client IP behind the k8s ingress, so per-IP rate limiting only fully works in docker-compose.
- Kafka keeps the CDC topic for 7 days; a consumer down longer than that can't replay from Kafka.
- Single Kafka broker and single Postgres per database (no replicas).
