# 4. Kafka messages are keyed by the item's own ID, not `userId`

**Status:** Accepted (target design — not yet built, see README)

**Context:** Kafka's partition count is fixed by the topic config (2 partitions here) — it doesn't grow with the number of items or users. A message's key only decides, via hashing, *which one* of those fixed partitions it lands in. Kafka only guarantees ordering *within* a partition, and since a key's hash always maps to the same partition, all messages sharing a key stay together and in order — this is true no matter which field is chosen as the key.

**Decision:** Key messages by the transaction's item ID rather than `userId`.

**Consequences:** Per-item ordering (e.g. create before a later delete of that same item) holds either way, so that's not actually what this choice buys. What it does buy: keying by `userId` would put *all* of one user's transactions on a single partition, so one very active user overloads that partition (and its consumer) while other partitions sit idle. Keying by item ID spreads one user's transactions across every partition instead, avoiding that hot-partition problem — at the cost of no longer having all of one user's events in a single, easily-ordered stream (not needed here, since ordering only has to hold per item).
