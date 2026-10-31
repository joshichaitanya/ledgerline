# Testing locally

Steps to run the backend + frontend locally, and how to verify things actually worked, based on what we've debugged so far.

Two ways to run this: **docker-compose** (below) or **Kubernetes on a local cluster** (further down) — treating the local cluster like a real deployment target, for learning k8s, not for actually deploying anywhere.

## Automated tests

```
yarn install
yarn test
```

Runs the Vitest suites of `db-writer-service`, `get-transactions-service`, `categories-service`, and `create`/`update`/`delete-transaction-service` (72 tests). They run against throwaway Postgres/Redis containers started by Testcontainers, so **Docker must be running** — but they don't use or touch the docker-compose stack below. Run one service's tests with `yarn --cwd services/<service> test`. What each covers: `docs/TODO.md` item 6.

### End-to-end (browser) tests

```
docker compose up -d --build                   # the whole stack (migrations run automatically)
yarn --cwd e2e playwright install chromium     # once
yarn e2e
```

Playwright drives the real web app in Chromium against the running stack: sign-up/login/change-password, add/edit/delete transactions through the whole pipeline, reports, custom categories, and accessibility (axe + keyboard) in both themes. See `e2e/README.md`.

## 1. Clean slate (optional)

Only do this if you want to wipe all data and start fresh:
```
yarn clean-slate
```
This removes containers, network, **and** volumes (Postgres data). Plain `docker compose down` (no `-v`) keeps your data.

## 2. Start the backend

```
yarn backend:up
```

Check everything is actually running:
```
docker compose ps
```

To stop it later (keeps data — use `yarn clean-slate` instead to wipe it):
```
yarn backend:stop
```

## 3. Migrations — automatic

Nothing to run: each database's migrations run in a one-off `*-migrate` container (`event-store-migrate`, `transactions-migrate`, `reference-migrate`, `auth-migrate`) before the services that need them start — on every `up`, skipping what's already applied. Check one with `docker compose logs reference-migrate`.

`yarn migrate` still exists for running them from your machine against the exposed ports (e.g. while developing a new migration). Port **5435** is `event-store-db`'s host port, **5433** `transactions-db`'s, **5434** `reference-db`'s, **5436** `auth-db`'s — none is the default 5432, so a missing `DATABASE_URL` gives `ECONNREFUSED ::1:5432`.

## 4. Confirm the backend is up

```
curl localhost:3000/health
curl localhost:3001/health
curl localhost:3002/health
curl localhost:3003/health
curl localhost:3004/health
curl localhost:3005/health
curl localhost:8000/  # api-gateway - a 404 here is fine, it just means no route matches "/"; it confirms the gateway itself is up
```
Should each return `{"status":"ok"}`. (3000 = `create-transaction-service`, 3001 = `get-transactions-service`, 3002 = `categories-service`, 3003 = `auth-service`, 3004 = `update-transaction-service`, 3005 = `delete-transaction-service`, 8000 = `api-gateway`.)

## 5. Start the frontend

`web-app` only ever calls `api-gateway` (port 8000) now, not any service's own port directly — see `infrastructure/api-gateway/README.md`. Backend and frontend both default to port 3000, so this runs the frontend on a different port:
```
yarn frontend:up
```
Open `http://localhost:3100`.

## 6. Test the flow

Go to `http://localhost:3100/register`, create an account. You should land back on the dashboard, logged in (Sidebar shows your name, and Home/View Transactions/View Reports/Change Password are now visible — they're hidden while logged out). Try **Log out** from the Sidebar, then **Log in** again with the same credentials.

Go to **View Transactions** — it loads the list from `get-transactions-service`, which reads `transactions-db` (no mock data any more, so it starts empty until transactions have flowed through `db-writer-service`). Click **+ Add Transaction**, fill in the form, submit. It should succeed (no `ERR_CONNECTION_REFUSED`) and the modal should close with the new transaction showing in the list.

## 7. Check backend logs

```
docker compose logs -f create-transaction-service
```
- **Success**: `Received 1 transactions`
- **Error**: `Failed to process transactions: <error>` (this route now has try/catch, so failures log cleanly and return a `500` instead of hanging)

## 8. Query the database directly (event_store)

Via the running container:
```
docker compose exec event-store-db psql -U postgres -d event_store_db -c '\dt'
docker compose exec event-store-db psql -U postgres -d event_store_db -c "SELECT * FROM event_store;"
```

Or connect interactively:
```
docker compose exec event-store-db psql -U postgres -d event_store_db
```
then run `\dt` or `SELECT * FROM event_store;` inside the prompt.

Or from your host machine directly (if `psql` is installed locally), using the exposed port:
```
psql -h localhost -p 5435 -U postgres -d event_store_db -c "SELECT * FROM event_store;"
```

## 9. Query the users table (auth-db)

Confirms sign-up actually created a row (`password_hash` shown so you can see it's hashed, not stored in plain text):
```
docker compose exec auth-db psql -U postgres -d auth_db -c "SELECT id, name, email, password_hash FROM users;"
```

Or from your host machine directly (if `psql` is installed locally), using the exposed port:
```
psql -h localhost -p 5436 -U postgres -d auth_db -c "SELECT id, name, email, password_hash FROM users;"
```

## 10. Check the spend-summary-cache (Redis)

Not used by any service yet (see `README.md` TODO) — this just confirms the container itself is up and reachable.

Start it if it isn't already running:
```
docker compose up -d spend-summary-cache
```

Ping it via the running container:
```
docker compose exec spend-summary-cache redis-cli ping
```
Should return `PONG`.

Or from your host machine directly (if `redis-cli` is installed locally), using the exposed port:
```
redis-cli -h localhost -p 6379 ping
```

## Known gotchas (already fixed, documented for reference)

- **pgbouncer not listening on 6432** — the `edoburu/pgbouncer` image needs `LISTEN_PORT: "6432"` explicitly set; mapping the port in `docker-compose.yml` alone doesn't make it listen there.
- **`error: server login failed: wrong password type`** — Postgres 16 defaults to `scram-sha-256`, which didn't line up with pgbouncer's password handling. Fixed by setting `POSTGRES_HOST_AUTH_METHOD: trust` on `event-store-db` (local/demo only — skips password verification entirely).
- **`POSTGRES_HOST_AUTH_METHOD` only applies on first database init** — if you change this setting on a container with an existing data volume, it won't take effect until you also wipe that volume (`docker volume rm scalable-demo_event-store-db-data`, or the full clean-slate step above).
- **Migration `ECONNREFUSED ::1:5432`** — means `DATABASE_URL` wasn't set when running `migrate:up`, so it fell back to the default port 5432 instead of the exposed 5435.

---

# Testing on Kubernetes (local cluster)

Same idea as above, but running on a local Kubernetes cluster instead of docker-compose — treating it like a real deployment target for learning k8s, not for actually deploying anywhere. Full build/apply reference: `k8s/README.md`. Both `k8s/pgbouncer.yaml` and `k8s/event-store-db.yaml` already have the `LISTEN_PORT`/`POSTGRES_HOST_AUTH_METHOD` fixes baked in from the gotchas above — you shouldn't hit those same two bugs here.

## 1. Have a local cluster running
Docker Desktop → Settings → Kubernetes → Enable Kubernetes (recommended — no extra tooling since Docker Desktop's already installed). Or `minikube start` / `kind create cluster`. See `k8s/README.md` for ingress-controller setup, which differs slightly per option.

## 2. Build images and apply manifests
Full steps (image build args, ordering) are in `k8s/README.md`. Short version:
```
docker build -t create-transaction-service:local -f services/create-transaction-service/Dockerfile .
docker build -t update-transaction-service:local -f services/update-transaction-service/Dockerfile .
docker build -t delete-transaction-service:local -f services/delete-transaction-service/Dockerfile .
docker build -t get-transactions-service:local -f services/get-transactions-service/Dockerfile .
docker build -t categories-service:local -f services/categories-service/Dockerfile .
docker build -t auth-service:local -f services/auth-service/Dockerfile .
kubectl apply -f k8s/
```

## 3. Point hostnames at the ingress
```
echo "127.0.0.1 app.scalable-demo.local api.scalable-demo.local get-transactions.api.scalable-demo.local categories.api.scalable-demo.local auth.api.scalable-demo.local update.api.scalable-demo.local delete.api.scalable-demo.local" | sudo tee -a /etc/hosts
```
(use `$(minikube ip)` instead of `127.0.0.1` if using minikube)

## 4. Migrations — automatic
Nothing to run: each Deployment that owns a database runs its migrations in a `migrate` init container before starting, and the `kafka-connect` pod registers the CDC connector itself. See `k8s/README.md` step 4 for details and how to see their logs.

## 5. Confirm the backend is up
```
curl http://api.scalable-demo.local/health
curl http://get-transactions.api.scalable-demo.local/health
curl http://categories.api.scalable-demo.local/health
curl http://auth.api.scalable-demo.local/health
curl http://update.api.scalable-demo.local/health
curl http://delete.api.scalable-demo.local/health
curl http://api-gateway.scalable-demo.local/  # a 404 here is fine - it just confirms the gateway itself is up
```
Should each return `{"status":"ok"}` (except the gateway, which has no `/health` route of its own).

## 6. Test the flow
Open `http://app.scalable-demo.local` in a browser (`web-app` calls only `api-gateway.scalable-demo.local` now — see `infrastructure/api-gateway/README.md` — not each service directly). Go to **View Transactions**, click **+ Add Transaction**, submit one.

## 7. Check logs
```
kubectl logs -f deployment/create-transaction-service -n scalable-demo
```
Same success/error messages as the docker-compose section above (`Received 1 transactions` / `Failed to process transactions: <error>`).

## 8. Query the database
```
kubectl exec -it statefulset/event-store-db -n scalable-demo -- psql -U postgres -d event_store_db -c "SELECT * FROM event_store;"
```

## Extra k8s-specific things worth checking while learning
```
kubectl get pods -n scalable-demo          # all pods Running/Ready
kubectl describe pod <pod-name> -n scalable-demo   # events, why a pod isn't ready
kubectl get pvc -n scalable-demo           # persistent volume claims bound for the 3 Postgres StatefulSets
kubectl rollout restart deployment/create-transaction-service -n scalable-demo   # simulate a redeploy
```

---

# Not yet testable (see `TODO.md` in this folder)

No logic exists yet for these, so there's no test flow to run — listed here so it's clear why, not because there's a command to try:

- **Reconciling `auth-db` accounts with `reference-db` profiles** — signing up creates a credentials row in `auth-db` only; nothing links it to a `reference-db` profile (name/phone/city/country).
- **Adding a category from `web-app`** — `categories-service` has the create APIs, but the web app has no UI for them yet (only lists).
- **Automated tests for `web-app` and `auth-service`** — the event pipeline's services and `categories-service` have tests (see "Automated tests" at the top); these two don't yet.
- **`web-app` proxying backend calls through its own Next.js server** — the browser now calls `api-gateway` (one URL, CORS/JWT/rate-limiting handled there — see `infrastructure/api-gateway/README.md`) instead of each backend service directly, but it still calls the gateway's URL directly rather than through a Next.js proxy layer on top of that.
- **`toolkit`'s `requireAuth` wired into the backend services** — access-token verification currently happens only at `api-gateway` (Kong's `jwt` plugin); the services themselves still don't verify it a second time.
