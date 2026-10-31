# 2. Event-store (DB1) comes before Kafka, not the API publishing straight to Kafka

**Status:** Accepted (target design — not yet built, see README)

**Context:** The earlier/simpler version has the API publish directly to Kafka. If Kafka or a consumer is down when a request comes in, that transaction is lost unless the API itself retries or queues it.

**Decision:** The API writes to a Postgres table (`event_store`) first. A CDC tool (e.g. Debezium) watches Postgres's write-ahead log and publishes to Kafka from there, instead of the API publishing to Kafka directly.

**Consequences:** Postgres becomes the actual durability point — once the insert commits, the transaction is safe even if Kafka is completely down; CDC will forward it once Kafka comes back. The cost is an extra hop (and an extra moving part, CDC) between the API and Kafka, and the API's write latency is now a Postgres insert instead of a Kafka publish.
