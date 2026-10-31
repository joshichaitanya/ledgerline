# 6. Each day's event-store partition is further hash-split by item ID

**Status:** Accepted (target design — not yet built, see README)

**Context:** A single partition per day would still funnel every write for that day — potentially a very high-traffic day, or repeated writes for one hot item — through one physical table, concentrating write load right when it matters most (peak traffic).

**Decision:** Each day's partition is itself partitioned again, by `HASH (item_id)` into a fixed number of buckets (`HASH_BUCKETS = 4`), so a given day's writes land across several physical sub-tables instead of one.

**Consequences:** Write load for a busy day is spread across multiple physical partitions instead of serializing on one. TTL cleanup is unaffected: dropping the parent day-partition drops all its hash buckets in one operation, so the two schemes (time-based drop, hash-based write spreading) don't conflict. The cost is more tables to manage per day (`HASH_BUCKETS` sub-partitions instead of one), and `HASH_BUCKETS` is a fixed number chosen up front — changing it later means migrating existing partitions, not just editing a config value.
