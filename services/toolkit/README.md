# toolkit (`@scalable-demo/toolkit`)

Shared code, published as its own npm package and pulled into each service as a normal dependency — instead of copy-pasting the same logic into every service.

Not a running service itself (like `mock-data-generator`, it's plain code, no server/process of its own) — it just lives under `services/` alongside everything else in this repo.

## What's here

- **`requireAuth(jwtSecret)`** (Express middleware) — verifies an access token's signature and expiry from the `Authorization: Bearer <token>` header, rejects with 401 if missing/invalid/expired, attaches the decoded payload (`{ userId, jti, exp }`) to `req.auth`.
  - **Purely stateless, always** — no database lookup, no revocation check. This works because access tokens are short-lived (15 minutes, see `services/auth-service/README.md`) — there's no separate "was this revoked early" state to check the way there is for `auth-service`'s longer-lived refresh tokens (which it tracks itself, in its own `refresh_tokens` table, not via this middleware).
- Other cross-service concerns land here as they come up (e.g. shared request-logging, a shared `Transaction`/`Category` type, common error-response shape) — the bar is "used identically by 2+ services," not "might be useful someday."

## How services pull it in

Added as a normal dependency in each service's `package.json`. For now, that's a local `file:../toolkit` reference (see `auth-service/package.json`) rather than a real published/versioned package — there's no npm registry set up for this repo. Real semver publishing is future work.

Used by `auth-service`, `create`/`update`/`delete-transaction-service`, `get-transactions-service`, and `categories-service` — each takes `userId` only from `req.auth`, never from the request ([ADR 0013](../../docs/adr/0013-user-id-from-verified-token.md)). Their Docker builds use the repo root as context so this folder can be copied in.

### After changing anything here

Yarn installs a `file:` dependency as a **copy** in each service's `node_modules`, not a link — so a change here doesn't reach the services until you rebuild and re-copy:

```
yarn --cwd services/toolkit build
yarn install --check-files
```

`"files": ["dist"]` in `package.json` matters: without it, Yarn leaves out anything the repo's `.gitignore` ignores when copying — including `dist/` — so every copy had no compiled code. `tsc` didn't notice (it fell back to the root `node_modules` link), but Node and Vitest couldn't load the package at all.

## Not done yet

- Not actually published/versioned — `file:../toolkit` only works for services in this same repo checkout, and every consumer effectively moves together (the "upgrade independently" benefit doesn't apply yet).

See `docs/TODO.md` item 9 and `services/auth-service/README.md`.
