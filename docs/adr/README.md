# Architecture Decision Records

Short notes on the non-obvious design choices in this repo. See root `README.md` for the full architecture diagram.

1. [The UI sends its own transaction ID](0001-client-generated-transaction-id.md)
2. [Event-store (DB1) comes before Kafka](0002-event-store-before-kafka.md)
3. [Event-store TTL via daily-partition drop](0003-event-store-ttl-via-partition-drop.md)
4. [Kafka messages keyed by item ID, not userId](0004-kafka-key-item-id.md)
5. [Event-store is insert-only](0005-event-store-insert-only.md)
6. [Daily partitions hash-split by item ID](0006-event-store-hash-split-partitions.md)
7. [Use an off-the-shelf CDC tool (Debezium + Kafka Connect), not a custom service](0007-cdc-tool-vs-custom-service.md)
8. [Add an API gateway (Kong for now, custom Node/Express gateway later)](0008-api-gateway-kong.md)
9. [Tombstones live on the `transactions` row itself (`deleted_at`)](0009-tombstones-as-deleted-at-column.md)
10. [Idempotent apply via a `last_event_at` check on each row](0010-idempotency-via-last-event-at.md)
11. [Spend totals cached cache-aside (invalidate on write), monthly only](0011-spend-summary-cache-aside.md)
12. [One user id everywhere: the `auth-db` account id](0012-auth-db-user-id-everywhere.md)
13. [Services take `userId` from the verified access token, never from the request](0013-user-id-from-verified-token.md)
14. [Transaction ownership is enforced in `db-writer-service`; wrong-owner events go to the DLQ](0014-transaction-ownership-in-db-writer.md)
15. [Categories: shared defaults plus each user's own, served by one `categories-service`](0015-categories-shared-defaults-plus-custom.md)
16. [Gateway rate limit per client IP, not per Kong consumer](0016-rate-limit-per-client-ip.md)
