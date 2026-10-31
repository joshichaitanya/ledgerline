# 1. The UI sends its own transaction ID

**Status:** Accepted

**Context:** A client can retry a request (network timeout, app restart) without knowing if the first attempt actually went through. Without a stable ID, a retry looks identical to a brand new transaction, and we'd double-count it.

**Decision:** The client generates the transaction's ID itself and sends it in the request, instead of the server generating one. That same ID becomes the row's key in `event_store` and the primary key in `transactions` (`transaction-consumer-service` inserts with `ON CONFLICT (id) DO NOTHING`).

**Consequences:** A retried request with the same ID is silently ignored downstream — no duplicate transactions, no need for the client to track "did this succeed?" state. The tradeoff is trust: the server accepts whatever ID the client sends, so ID generation must be genuinely random (e.g. UUID) to avoid collisions between different clients.
