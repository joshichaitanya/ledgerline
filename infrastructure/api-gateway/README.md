# api-gateway (Kong)

Single entry point for every backend service. `web-app` calls only this — see [ADR 0008](../../docs/adr/0008-api-gateway-kong.md) for why this exists and why Kong specifically.

## What's set up

- `kong.yml`: the whole gateway config — services, routes, plugins, the one consumer — as one checked-in file. Kong runs **DB-less** (`KONG_DATABASE: "off"` in `docker-compose.yml`/`k8s/api-gateway.yaml`): it reads this file at startup instead of needing its own Postgres/Cassandra, so there's no extra stateful thing to run or keep in sync — the file *is* the source of truth, no separate admin-API calls to configure it by hand.
- **Routing**: every backend service gets a route matching its real path (`/transactions`, `/categories`, `/signup`, etc.) with `strip_path: false` — the gateway forwards the exact same path upstream, it doesn't rewrite it.
- **JWT verification**: Kong's `jwt` plugin is applied to every route except `/signup`, `/login`, `/refresh` (those are how a client gets a token in the first place — can't require one to reach them). It matches an incoming token to the one `web-app-clients` consumer via the token's `iss` claim, then verifies the signature with `JWT_SECRET` — the same secret `auth-service` signs with. See "The `iss` claim" below.
- **Rate limiting**: `rate-limiting` plugin, applied globally, 100 requests/minute per client, `policy: redis` against `spend-summary-cache` — so the counter is shared across every gateway replica instead of each one tracking its own (see `k8s/api-gateway.yaml`, `replicas: 2`).
- **CORS**: handled at the gateway only (`cors` plugin) — every backend service's own CORS middleware has been removed. Every route's `methods` list includes `OPTIONS` even though no upstream service handles it — see "Gotcha: CORS preflight" below.

## The `iss` claim

Kong's `jwt` plugin needs to know *which* consumer's secret to verify a token against — it does that by reading the token's `iss` (issuer) claim and looking up a consumer whose jwt credential `key` matches it. `auth-service` didn't have this claim before Kong needed it; `TOKEN_ISSUER = 'scalable-demo'` in `services/auth-service/src/services/auth.service.ts` is what satisfies that requirement, and `services/toolkit/src/types.ts`'s `TokenPayload.iss` is the corresponding (optional) type field.

## Gotcha: CORS preflight needs `OPTIONS` on every route

A route whose `methods` only lists its real verb (e.g. `["POST"]`) doesn't match an `OPTIONS` preflight request at all — Kong responds `404 no Route matched`, and the `cors` plugin never even gets a chance to answer it, since Kong only runs plugins for requests that already matched a route. Fixed by adding `"OPTIONS"` to every route's `methods` list. This is safe on JWT-protected routes too — the `cors` plugin runs before `jwt` (higher priority), so it intercepts and answers the (token-less) preflight before `jwt` would otherwise reject it.

## Gotcha: Kong caches upstream DNS — restart it after recreating a backend container

Hit this directly while testing: after rebuilding `auth-service` (a new container, new internal IP), `POST /signup` through the gateway started returning a **different service's** 404 page — Kong was still sending requests to the old, now-reused IP. Restarting `api-gateway` (`docker compose restart api-gateway`) fixed it immediately. In local dev, restart the gateway after rebuilding/recreating any backend service it routes to. This wouldn't be an issue with a real DNS-aware setup at longer-lived hostnames/service-discovery in a real cluster, but is a real gotcha with Docker Compose's container recreation.

## k8s: why `replicas: 2`, not 1

This is the *only* entry point every other service is reached through. A single replica means zero gateway capacity — everything unreachable — during any crash, OOM, or rolling update. `k8s/api-gateway.yaml` runs 2 replicas with a `readinessProbe`/`livenessProbe` (`kong health`, same check `docker-compose.yml`'s healthcheck uses) so a still-starting pod doesn't receive traffic, plus a `PodDisruptionBudget` (`minAvailable: 1`) so a voluntary disruption (node drain, rolling update) can't take both down at once. This is also *why* rate limiting had to move off `policy: local` (see above) — with 2+ replicas each tracking its own count, the real limit becomes `100 × replica count`, not 100.

`k8s/api-gateway.yaml`'s `kong.yml` is embedded in a ConfigMap and kept in sync with `infrastructure/api-gateway/kong.yml` by hand — there's no build step that generates one from the other, so a change to one needs to be copied to the other.

## Verified working

Tested end-to-end: CORS preflight (`OPTIONS`) answered directly by the gateway with a single, correct set of `Access-Control-*` headers; signed up through the gateway (`POST http://localhost:8000/signup`, no token needed); used the resulting access token to call `create-transaction-service` (`POST /transactions`) and `get-categories-service` (`GET /categories`) through the gateway — both accepted, with exactly one `Access-Control-Allow-Origin` header each (no duplication now that per-service CORS is gone). Called `/transactions` with no `Authorization` header — rejected with `401` before it ever reached the backend service. Confirmed the rate-limit counter actually lands in `spend-summary-cache` (`ratelimit:...` key via `redis-cli`), not gateway-local memory.

## Not done yet

- **Planned successor**: this is Kong for now. `docs/TODO.md` item 12 also tracks replacing it with a custom Node/Express gateway service later, once the specific needs (which plugins, which routing quirks) are well understood from running Kong first.
