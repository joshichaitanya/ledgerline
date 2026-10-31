# auth-service

Handles sign-up and login for users, and issues tokens other services can check. Full request/response details for every endpoint are in [`docs/openapi.yaml`](../../docs/openapi.yaml).

`web-app` has login/register/change-password pages wired up to this API — see `services/web-app/src/context/AuthContext.tsx` and `services/web-app/src/pages/{login,register,change-password}.tsx`. Account-specific pages and nav items are hidden/redirected when logged out, via `services/web-app/src/hooks/useRequireAuth.ts`.

## API

- `POST /signup` — body `{ name, email, password }`. Creates the user (`bcryptjs`-hashed password, never stored in plain text), returns `{ user, accessToken }` and sets the refresh token as an httpOnly cookie (see below). `409` if the email is already registered.
- `POST /login` — body `{ email, password }`. Returns `{ user, accessToken }` + sets the cookie on success, `401` on a wrong email/password.
- `POST /refresh` — no body; reads the refresh token from the cookie. Returns `{ accessToken }` and rotates the cookie to a new refresh token. `401` if the cookie is missing, invalid, expired, or already used/revoked.
- `POST /logout` — requires `Authorization: Bearer <accessToken>`; reads the refresh token from the cookie. Revokes it and clears the cookie, `204` on success.
- `PUT /change-password` — requires `Authorization: Bearer <accessToken>`, body `{ currentPassword, newPassword }`. `401` if `currentPassword` doesn't match, `204` on success. Also revokes every refresh token for that user and clears the cookie (see below).

## Access token vs. refresh token

Two different tokens, two different jobs:

- **Access token** — short-lived (15 minutes), sent as `Authorization: Bearer <accessToken>` on every request to any service. Verified statelessly (signature + expiry only, via `services/toolkit`'s `requireAuth`) — no database lookup, so any service holding `JWT_SECRET` can check it without calling `auth-service`. Stored client-side in `localStorage` (`web-app`'s `authStorage.ts`) — readable by JS, but its short lifetime limits the exposure if that's ever a problem (e.g. an XSS bug).
- **Refresh token** — long-lived (30 days), used only to get a new access token via `POST /refresh`. Sent as an **httpOnly cookie** (`services/auth-service/src/lib/refresh-token-cookie.ts`) — never in a JSON response body, never touched by client-side JS at all, so an XSS bug can't read it out. Unlike the access token, it *is* tracked server-side too — each one has a row in `auth-db`'s `refresh_tokens` table (`services/auth-service/migrations/1700000000001_refresh_tokens.js`). That row is what makes revocation possible:
  - `/refresh` **rotates** the token: the old row is deleted and a new access/refresh pair is issued. A stolen refresh token stops working the moment the real client refreshes next.
  - `/logout` deletes the given refresh token's row — that one session is over. The still-live access token it already handed out keeps working for at most 15 more minutes (its own natural expiry), which is the accepted tradeoff of not checking revocation on every request.
  - `/change-password` deletes **every** refresh token row for that user — every other session is forced to log in again, not just the current one.

This is why access tokens don't need a revocation check at all (unlike an earlier version of this service, which tried to revoke access tokens directly) — they're short-lived enough that the only thing worth tracking/revoking is the refresh token that can keep minting new ones.

## The refresh-token cookie: cross-origin gotchas

`web-app` and `api-gateway`/`auth-service` are different origins (different ports even in local dev — `localhost:3100` vs `localhost:8000`), which matters for a cookie in two ways:

- **`SameSite=None; Secure`** is required for the browser to send/receive the cookie on a cross-origin request at all — the default (`Lax`) would silently drop it. `Secure` normally means HTTPS-only, but Chrome and Firefox both treat `localhost` as a secure context, so this still works in local dev without HTTPS — as long as `web-app` is reached via `http://localhost:...`. It will **not** work over a plain-HTTP LAN IP or a non-localhost hostname without HTTPS in front.
- **`credentials: 'include'`** is required on the `fetch()` calls that need to send or receive the cookie (`web-app`'s `lib/auth.ts`) — without it, the browser won't attach the cookie to the request, and won't act on a `Set-Cookie` in the response either, even same-origin-policy-wise-allowed CORS requests.
- Kong's `cors` plugin needs `credentials: true` and an **explicit** origin (`infrastructure/api-gateway/kong.yml` / `k8s/api-gateway.yaml`'s ConfigMap) — a wildcard `origins: ["*"]` is incompatible with `credentials: true`; browsers reject that combination outright.

Only the auth endpoints (`lib/auth.ts`) use `credentials: 'include'` — the general-purpose `authFetch` used for everything else deliberately doesn't, so the refresh-token cookie isn't sent to routes that have no reason to see it.

## Data

Owns its own database, `auth-db` (`docker-compose.yml` / `k8s/auth-db.yaml`) — a `users` table (`id`, `name`, `email`, `password_hash`) and a `refresh_tokens` table (`jti`, `user_id`, `expires_at`). Migrations live here (`services/auth-service/migrations/`), run with `yarn --cwd services/auth-service migrate:up`.

**This `users.id` is the one user id across the whole system** ([ADR 0012](../../docs/adr/0012-auth-db-user-id-everywhere.md)) — transactions, custom categories, and spend totals are all keyed by it. `reference-db` used to have a separate demo `users` table with its own ids; it's been dropped, so there's nothing to reconcile. Other services get the id from the access token's `userId` claim, never from the request ([ADR 0013](../../docs/adr/0013-user-id-from-verified-token.md)).

## Not done yet

- No cleanup job for expired rows in `refresh_tokens`.
- No profile fields beyond `name`/`email` (the old demo profiles' phone/city/country were dropped with `reference-db.users`). If needed, they'd belong here, keyed by this same id.

See root `README.md` Architecture section and `docs/TODO.md` item 9.
