# 13. Services take `userId` from the verified access token, never from the request

**Status:** Accepted (see `services/toolkit`, `docs/TODO.md` item 9)

**Context:** The transaction and category services read `userId` from the request body or query string (`?userId=1`). Whatever the caller sends is believed, so anyone with any valid token could read, create, change, or delete transactions as any other user. `api-gateway` verifies the token ([ADR 0008](0008-api-gateway-kong.md)), but it doesn't pass the user's identity on in a form the services use. The services also stay reachable without the gateway, on their own ports in `docker-compose.yml`.

**Decision:** Every service that acts for a user uses `toolkit`'s `requireAuth` middleware. That covers `create`/`update`/`delete-transaction-service`, `get-transactions-service`, and `categories-service`. Each one verifies the access token itself (same `JWT_SECRET`) and takes `userId` from `req.auth.userId`. A `userId` sent in a body or query string is ignored.

**Consequences:**
- A user can only act as themselves. The id comes from a token only `auth-service` can sign.
- The token is checked twice, at the gateway and in the service. That's a little extra CPU per request, and it means a service that's reached directly (bypassing the gateway) is still protected. The gateway stays the main edge defense (rate limiting, CORS).
- Every one of these services needs `JWT_SECRET`, and all of them must share it with `auth-service`. Rotating the secret means redeploying all of them together.
- These services now depend on `toolkit` through a local `file:../toolkit` path, so their Docker builds use the repo root as build context (as `auth-service` already does).
- The token says *who* is asking. It doesn't say whether that user owns the transaction being changed. Writes are asynchronous, so that check happens later, in `db-writer-service` ([ADR 0014](0014-transaction-ownership-in-db-writer.md)).
