# Kubernetes manifests (local cluster)

Plain YAML, no Helm/Kustomize. Targets a local cluster — not a cloud provider.

## Prerequisites

**Recommended: Docker Desktop's built-in Kubernetes** — since Docker Desktop is already installed and used for `docker compose` in this project, this is the least new tooling: Docker Desktop → Settings → Kubernetes → Enable Kubernetes. No separate install, and it shares Docker Desktop's own image store (no extra image-loading step below).

Alternatives, if you'd rather use a dedicated cluster tool:
- **minikube** (`minikube start`) — most commonly used for local k8s learning
- **kind** (`kind create cluster`) — runs cluster nodes as containers, fast to spin up/tear down

Either way, you also need an ingress controller:
- Docker Desktop Kubernetes: `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml`
- minikube: `minikube addons enable ingress`
- kind: see [kind's ingress guide](https://kind.sigs.k8s.io/docs/user/ingress/)

## 1. Build images locally
Since there's no image registry here, build straight into the cluster's own image store.

**Docker Desktop Kubernetes**: just build normally — it already shares Docker Desktop's image store, no extra step needed.

**minikube**: run this first so your shell's `docker build` targets minikube's internal registry:
```
eval $(minikube docker-env)
```

**kind**: build normally, then load each image after building: `kind load docker-image <name>:local`

```
docker build -t create-transaction-service:local -f services/create-transaction-service/Dockerfile .
docker build -t update-transaction-service:local -f services/update-transaction-service/Dockerfile .
docker build -t delete-transaction-service:local -f services/delete-transaction-service/Dockerfile .
docker build -t get-transactions-service:local -f services/get-transactions-service/Dockerfile .
docker build -t categories-service:local -f services/categories-service/Dockerfile .
docker build -t auth-service:local -f services/auth-service/Dockerfile .
docker build -t transaction-consumer-service:local services/transaction-consumer-service
docker build -t db-writer-service:local services/db-writer-service
docker build -t transaction-polling-consumer-service:local services/transaction-polling-consumer-service
docker build \
  --build-arg NEXT_PUBLIC_API_GATEWAY_URL=http://api-gateway.scalable-demo.local \
  -t web-app:local services/web-app
```
`web-app` calls only `api-gateway` now (see `infrastructure/api-gateway/README.md`), not each service directly — apply `k8s/api-gateway.yaml` (step 2 below) before building/deploying `web-app`.

## 2. Apply the manifests
```
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml -f k8s/secret.yaml
kubectl apply -f k8s/event-store-db.yaml -f k8s/transactions-db.yaml -f k8s/reference-db.yaml -f k8s/auth-db.yaml -f k8s/kafka.yaml -f k8s/spend-summary-cache.yaml
kubectl apply -f k8s/pgbouncer.yaml
kubectl apply -f k8s/kafka-connect.yaml
kubectl apply -f k8s/create-transaction-service.yaml -f k8s/update-transaction-service.yaml -f k8s/delete-transaction-service.yaml -f k8s/get-transactions-service.yaml -f k8s/categories-service.yaml -f k8s/auth-service.yaml -f k8s/transaction-consumer-service.yaml -f k8s/transaction-polling-consumer-service.yaml -f k8s/db-writer-service.yaml
kubectl apply -f k8s/api-gateway.yaml
kubectl apply -f k8s/web-app.yaml
kubectl apply -f k8s/ingress.yaml
```
(or just `kubectl apply -f k8s/` — Kubernetes will retry dependent resources until the ones they need exist)

## 3. Point hostnames at the ingress

Docker Desktop Kubernetes: the ingress is reachable at `localhost`, so:
```
echo "127.0.0.1 app.scalable-demo.local api.scalable-demo.local get-transactions.api.scalable-demo.local categories.api.scalable-demo.local auth.api.scalable-demo.local update.api.scalable-demo.local delete.api.scalable-demo.local api-gateway.scalable-demo.local" | sudo tee -a /etc/hosts
```

minikube:
```
echo "$(minikube ip) app.scalable-demo.local api.scalable-demo.local get-transactions.api.scalable-demo.local categories.api.scalable-demo.local auth.api.scalable-demo.local update.api.scalable-demo.local delete.api.scalable-demo.local api-gateway.scalable-demo.local" | sudo tee -a /etc/hosts
```

## 4. Migrations and CDC registration — automatic, nothing to run

- **Migrations** run in a `migrate` **init container** on each Deployment that owns a database, before the app container starts — on every deploy and every restart:

  | Deployment | Database | Command |
  |---|---|---|
  | `create-transaction-service` | `event-store-db` (direct, not via pgbouncer — its pooling breaks node-pg-migrate's lock) | `yarn migrate:up` |
  | `db-writer-service` | `transactions-db` | `yarn migrate:transactions:up` |
  | `categories-service` | `reference-db` (incl. the default categories) | `yarn migrate:up` |
  | `auth-service` | `auth-db` | `yarn migrate:up` |

  Already-applied migrations are skipped, and node-pg-migrate holds a database lock, so several replicas starting at once is safe. Watch one with `kubectl logs deploy/categories-service -c migrate -n scalable-demo`.
- **The CDC connector** is registered by a `connector-registrar` container in the `kafka-connect` pod — no Job to re-run. It (re-)registers whenever the connector is missing or `event-store-connector.json` in the ConfigMap changed (picked up within ~1 min of `kubectl apply`). The pod's `prepare-publication` init container waits for the `event_store` table (created by `create-transaction-service`'s migration) before Connect starts. Logs: `kubectl logs deploy/kafka-connect -c connector-registrar -n scalable-demo`.

Nothing needs port-forwarding or running from your machine any more.

## 5. Verify
```
kubectl get pods -n scalable-demo
```
Then open `http://app.scalable-demo.local` in a browser.

See `docs/TESTING.md` for the full test flow (posting a transaction, checking logs, querying the DB) — same steps as docker-compose, just using `kubectl` instead of `docker compose`.

## What's not included
- `mock-data-generator` — plain scripts, not a long-running service; run it from your machine against `http://api.scalable-demo.local`, not deployed as a pod

Note: these manifests (including the automatic migrations and CDC registration above) haven't been tested on a real cluster yet — `docker compose` is the tested path (see `docs/TODO.md` item 10).

`k8s/api-gateway.yaml` (`api-gateway`, 2 replicas + a `PodDisruptionBudget` — it's the only entry point, so a single replica would mean zero gateway capacity during any restart) is included and is what `web-app` actually calls, matching `docker-compose.yml`.
