# transactions-db

The real, queryable Postgres database — the single source of truth applications actually read from. Populated only by `db-writer-service` (the Operation consumer), never written to directly by the API.

Schema: `services/db-writer-service/migrations/transactions/`. Deleted transactions stay in the table as tombstones (`deleted_at` set), so **readers must filter `WHERE deleted_at IS NULL`** — see [ADR 0009](../../docs/adr/0009-tombstones-as-deleted-at-column.md).

```
docker compose exec transactions-db psql -U postgres -d transactions_db -c "SELECT id, amount, deleted_at, last_event_at FROM transactions;"
```

See root `README.md` Architecture section for the full diagram.
