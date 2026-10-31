# 8. Add an API gateway (Kong for now, custom Node/Express gateway later)

**Status:** Accepted — Kong built and verified; custom gateway is future work.

**Context:** This system is meant to handle millions of users, not stay a demo — that changes what's acceptable to skip. Before this, every backend service was reachable directly (its own port in `docker-compose.yml`, its own ingress host in `k8s/ingress.yaml`), each doing its own CORS, and none of them verifying the access token at all (only `auth-service` checks tokens, and only for its own `/logout`/`/change-password`). At scale that means: no centralized place to enforce auth, no rate limiting anywhere, and a client needs to know five-plus separate hostnames instead of one.

**Decision:** Put an API gateway in front of every backend service. Use Kong, in DB-less mode (declarative config file, no separate database for Kong itself), for now — not a custom-built gateway from day one.

**Why Kong now, not a custom gateway immediately:** Building a correct, secure gateway (JWT verification, rate limiting, routing, CORS, and everything else a gateway ends up needing — request logging, retries, circuit breaking) is itself a significant amount of work with a lot of ways to get subtly wrong. Kong is a mature, widely-deployed tool that already solves this. Standing it up first, in production-shaped use, is how the *actual* requirements for a custom gateway get discovered — instead of guessing at them upfront. The plan is to build the custom Node/Express gateway later, once Kong has been run for real and it's clear exactly which behavior needs to be reproduced (see `docs/TODO.md` item 9).

**Why DB-less mode specifically:** Kong normally stores its config (services/routes/plugins) in its own Postgres or Cassandra database, configured via an admin API. DB-less mode instead reads one declarative YAML file (`infrastructure/api-gateway/kong.yml`) at startup — no extra database to run, and the config is checked into git and reviewable like any other file, instead of being runtime state nobody can diff.

**Consequences:**
- JWT verification and rate limiting now happen at one place (the gateway), not duplicated into every service — but that means every backend service that should be protected has to have a matching route configured in `kong.yml`; forgetting one leaves it reachable un-gated if it's also still exposed directly (which, today, it still is — see below).
- Kong's `jwt` plugin requires tokens to carry an `iss` claim to look up which consumer/secret to verify against. `auth-service`'s tokens didn't have this before Kong needed it — added as `TOKEN_ISSUER` in `services/auth-service/src/services/auth.service.ts`.
- `web-app` doesn't call through the gateway yet — it still calls each service directly. Until that cutover happens, the gateway's protections aren't actually the only way in; the direct ports/ingress hosts still bypass it entirely. This is tracked, not shipped as "done."
- Rate limiting's `local` policy only holds an accurate count with one gateway replica — scaling the gateway to multiple replicas needs a shared store (e.g. Redis) for the count to mean anything. Not addressed yet.
- Extra moving part to operate: Kong itself needs deploying/monitoring, and debugging a routing/plugin issue means learning Kong's own model (services → routes → plugins → consumers) instead of just reading application code.
