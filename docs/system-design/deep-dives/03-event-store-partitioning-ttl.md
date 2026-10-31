# Deep dive 3: Event-store partitioning and TTL

The event store is a **buffer**, not the long-term record. Once `db-writer-service` has applied an event, the row is only useful for a short replay window. So it must (a) take a lot of inserts and (b) throw old rows away cheaply.

## Two levels of partitioning

```
event_store                         PARTITION BY RANGE (created_at)
└── event_store_2026_10_29          one day        PARTITION BY HASH (item_id)
    ├── event_store_2026_10_29_0    MODULUS 4, REMAINDER 0
    ├── event_store_2026_10_29_1    MODULUS 4, REMAINDER 1
    ├── event_store_2026_10_29_2    MODULUS 4, REMAINDER 2
    └── event_store_2026_10_29_3    MODULUS 4, REMAINDER 3
└── event_store_default             catches rows with no matching day
```

| Level | Key | Why |
|---|---|---|
| Range by day | `created_at` | Old data leaves by dropping a whole day in one step ([ADR 0003](../../adr/0003-event-store-ttl-via-partition-drop.md)) |
| Hash into 4 buckets | `item_id` | A busy day's inserts spread over 4 physical tables instead of one ([ADR 0006](../../adr/0006-event-store-hash-split-partitions.md)) |

The two don't fight: dropping the day table drops its 4 buckets with it.

## Why drop partitions instead of `DELETE ... WHERE created_at < ...`

| `DELETE` old rows | `DROP` old partition |
|---|---|
| Touches every row, writes WAL for each | One metadata change |
| Leaves dead rows → needs `VACUUM` | Nothing left behind |
| **Each deleted row shows up in CDC as a delete event** | Not a row change, so CDC ignores it |

The last row is the real reason. The event store is insert-only so that every WAL entry is a real user action ([ADR 0005](../../adr/0005-event-store-insert-only.md)). Row deletes for cleanup would break that.

## The partition manager

`services/create-transaction-service/src/scripts/manage-partitions.ts`, run once a day by the `k8s/event-store-partition-manager.yaml` CronJob:

1. **Create tomorrow's partition** (with its 4 hash buckets), so inserts after midnight have somewhere to go.
2. **Drop partitions older than 1 day.**

A bug found in testing: Postgres couldn't infer the types of the `format()` parameters, so explicit `::text` / `::int` casts were added.

If the job misses a day, new rows land in `event_store_default` instead of failing. That keeps writes working, but those rows are not dropped by the daily step, so the job should be monitored.

## Things to keep in mind

- **Retention must be longer than the slowest consumer delay.** Today: 1 day in the event store, 7 days in Kafka. If `db-writer-service` is down for longer than Kafka keeps the topic, events can't be replayed from either place.
- **Replication slot vs drop.** Debezium must have read a day's WAL before that day is dropped. With a 1-day TTL and a healthy connector this is never close.
- **`HASH_BUCKETS = 4` is fixed.** Changing it only applies to new days (old days keep their old split until dropped), which is easy here because old days disappear within a day anyway.
- **Primary key `(id, created_at, item_id)`** must include every partition key. It is not used for lookups.
- **No secondary indexes**: nothing queries this table, and each index costs every insert.

## Example: what a day looks like in Postgres

```sql
SELECT inhrelid::regclass AS partition
FROM pg_inherits
WHERE inhparent = 'event_store_2026_10_29'::regclass;
-- event_store_2026_10_29_0 … event_store_2026_10_29_3
```
