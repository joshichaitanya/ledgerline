# PostgreSQL

Local Postgres runs via `docker-compose.yml` (service name: `db`).

## Schema

Tables: `categories`, `subcategories` (FK → `categories.id`), `users`, `transactions` (FK → `users.id` and `subcategories.id`). Owned and versioned by `services/db-writer-service` via `node-pg-migrate` (`migrations/1700000000000_init.js`).

Conventions:
- **snake_case** for all table/column names — Postgres's native convention; camelCase would require quoting every identifier in every query.
- **IDs kept as-is** from the existing JSON/generator scripts — `uuid` primary keys for `categories`/`subcategories`/`transactions` (matches `uuid.uuid4()` in the Python generators), `integer` primary key for `users` (matches its sequential id). No translation layer between JSON and DB rows.
- **`numeric(12,2)`** for `transactions.amount` — fixed-point decimal, avoids floating-point rounding errors for monetary values (vs. `double precision`).

Field name mapping from the original JSON/TypeScript: `transactionId`→`id`, `subCategoryId`→`subcategory_id`, `transactionDate`→`transaction_date`, `userId`→`user_id`.

### Apply migrations
Each database's migrations live with the service that owns it. `yarn migrate` at the repo root runs all of them against the docker-compose databases:

| Database | Owner | Command |
|---|---|---|
| `event-store-db` (5435) | `create-transaction-service` | `yarn --cwd services/create-transaction-service migrate:up` |
| `transactions-db` (5433) | `db-writer-service` | `yarn --cwd services/db-writer-service migrate:transactions:up` |
| `reference-db` (5434) | `categories-service` | `yarn --cwd services/categories-service migrate:up` |
| `auth-db` (5436) | `auth-service` | `yarn --cwd services/auth-service migrate:up` |

Each needs `DATABASE_URL` set, e.g. `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/reference_db`.

There's no seed step any more: the default categories are a `reference-db` migration, and users are created by signing up (see `docs/adr/0012` and `0015`).

## Connect via psql
```
docker compose exec db psql -U postgres -d scalable_demo
```

## List tables
```
docker compose exec db psql -U postgres -d scalable_demo -c '\dt'
```

## Connect from host machine (if you have psql installed locally)
```
psql -h localhost -p 5432 -U postgres -d scalable_demo
```

## Run a SQL query directly from the command line (no interactive session)
```
docker compose exec db psql -U postgres -d scalable_demo -c "SELECT * FROM transactions LIMIT 10;"
```

Or from the host, if `psql` is installed locally:
```
psql -h localhost -p 5432 -U postgres -d scalable_demo -c "SELECT * FROM transactions LIMIT 10;"
```
