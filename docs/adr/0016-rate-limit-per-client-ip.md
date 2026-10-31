# 16. Gateway rate limit per client IP, not per Kong consumer

**Status:** Accepted (see `infrastructure/api-gateway/kong.yml`, `k8s/api-gateway.yaml`)

**Context:** `api-gateway` limits each client to 100 requests a minute ([ADR 0008](0008-api-gateway-kong.md)). Kong's rate limiter counts per *consumer* by default. But `kong.yml` has exactly one consumer, `web-app-clients`, which stands for "anyone holding a token we issued". So the limit wasn't 100 per user: it was **100 per minute for all logged-in users combined**. A few dozen people using the app at once would have most of their requests refused with `429`. The end-to-end tests (TODO item 13) found it: 27 requests got `429` during one parallel test run.

A true per-user limit needs the gateway to know *which* user each request is from. Kong's built-in limiter can only count per consumer, credential, IP, header, service or path. There's no Kong consumer per user, because users sign up dynamically and Kong's config is a static file. There were three options: (A) per client IP; (B) per `Authorization` header, which is roughly per session; or (C) keep the single shared limit.

**Decision:** Option A, `limit_by: ip`, at 100 requests a minute per client IP (k8s). The local docker-compose gateway allows 1000 a minute, because every end-to-end test runs from one machine, which is one IP, and a parallel run goes well past 100. That's the one value where `kong.yml` and its copy in `k8s/api-gateway.yaml` deliberately differ.

**Consequences:**
- One busy user no longer uses up everyone else's budget.
- Users behind one shared IP (an office, a mobile carrier's NAT) share a limit. That's acceptable at this scale, but it isn't per-user.
- Option B was rejected: the access token changes every 15 minutes on refresh, and each new token would get a fresh budget, so a client could reset its limit at will.
- Behind a load balancer or ingress, Kong must see the *real* client IP (via `X-Forwarded-For` and Kong's `trusted_ips` / `real_ip_header` settings). Otherwise every request looks like it comes from the load balancer, and the limit becomes one shared budget again. That isn't configured yet. The k8s ingress in front of Kong is exactly this case.
- A per-user limit is still the goal. It fits the planned custom gateway (ADR 0008's "later"), which can read `userId` from the verified token.
