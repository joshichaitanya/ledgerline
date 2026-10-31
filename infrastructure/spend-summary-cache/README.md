# Spend Summary Cache (Redis)

Redis-backed cache for pre-computed monthly spend totals — the fast-read side, service name `spend-summary-cache`. Also holds `api-gateway`'s rate-limit counters (`ratelimit:...` keys).

## What's cached

Cache-aside, monthly only — see [ADR 0011](../../docs/adr/0011-spend-summary-cache-aside.md).

- Key: `user:{userId}:month:{YYYY-MM}` (UTC month)
- Value: JSON, subcategory → total, e.g. `{"groceries":120.5,"fuel":60}`
- Written by `get-transactions-service` (`GET /transactions/summary`) when a month isn't cached yet, with a 1h TTL
- Deleted by `db-writer-service` whenever a change affects that month

The cache is never the source of truth, so it's always safe to clear. Totals refill from `transactions-db` on the next read.

## Connect via redis-cli
```
docker compose exec spend-summary-cache redis-cli
```

## Check connection
```
docker compose exec spend-summary-cache redis-cli ping
```

## List all keys
```
docker compose exec spend-summary-cache redis-cli keys '*'
```

## See one user's cached months
```
docker compose exec spend-summary-cache redis-cli --scan --pattern 'user:1:month:*'
```

## Clear all data
```
docker compose exec spend-summary-cache redis-cli flushall
```
