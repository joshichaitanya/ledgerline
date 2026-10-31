# API design

All calls go through `api-gateway` (Kong, `http://localhost:8000` locally). The full spec, with every field and error, is [`docs/openapi.yaml`](../openapi.yaml). This page is the quick overview.

## Rules that apply to every endpoint

- **Auth:** send `Authorization: Bearer <accessToken>`. Only `/signup`, `/login` and `/refresh` skip it.
- **User id comes from the token.** Any `userId` in a body or query is ignored ([ADR 0013](../adr/0013-user-id-from-verified-token.md)).
- **Rate limit:** per client IP, 1000/min in docker-compose, 100/min in k8s → `429`.
- **Errors:** services answer `{ "error": "..." }`, the gateway answers `{ "message": "..." }`.
- **Transaction writes are async:** they answer `202 Accepted` once the event is stored. `GET` shows the change a moment later.

## Endpoints

| Method | Path | Service | Auth | Success | Notes |
|---|---|---|---|---|---|
| POST | `/signup` | auth | none | `201` | Returns user + access token, sets refresh cookie. `409` if email taken. |
| POST | `/login` | auth | none | `200` | Same response as signup. `401` on wrong email/password. |
| POST | `/refresh` | auth | refresh cookie | `200` | Rotates the refresh token. `401` if missing / used / revoked. |
| POST | `/logout` | auth | bearer | `204` | Revokes this session's refresh token. |
| PUT | `/change-password` | auth | bearer | `204` | Revokes **all** the user's refresh tokens. |
| POST | `/transactions` | create-transaction | bearer | `202` | Body is an **array**; client sets each `transactionId`. |
| PUT | `/transactions/{id}` | update-transaction | bearer | `202` | Whole transaction. URL id wins over body id. |
| DELETE | `/transactions/{id}` | delete-transaction | bearer | `202` | Writes a tombstone event. |
| GET | `/transactions` | get-transactions | bearer | `200` | My live transactions, newest first. |
| GET | `/transactions/summary?year=&month=` | get-transactions | bearer | `200` | Totals per subcategory per UTC month. Cached. |
| GET | `/categories` | categories | bearer | `200` | Defaults + my own, with subcategories. |
| POST | `/categories` | categories | bearer | `201` | `409` if name already visible to me. |
| POST | `/categories/{id}/subcategories` | categories | bearer | `201` | `404` if category is missing or someone else's. |

## Example: create, then read

```http
POST /transactions
Authorization: Bearer eyJ...
Content-Type: application/json

[
  {
    "transactionId": "7d1c2a3e-5b6f-4c7d-8e9f-0a1b2c3d4e5f",
    "subCategoryId": "3f2c8a6e-1b7d-4c55-9a0e-2d4f6b8c1a90",
    "amount": 42.5,
    "description": "Weekly shop",
    "transactionDate": "2026-10-28T09:30:00.000Z"
  }
]
```
```http
HTTP/1.1 202 Accepted
```

A moment later:

```http
GET /transactions/summary?year=2026&month=10
```
```json
[
  { "month": "2026-10", "bySubcategory": { "3f2c8a6e-1b7d-4c55-9a0e-2d4f6b8c1a90": 42.5 } }
]
```

## Why these choices

| Choice | Reason |
|---|---|
| Client picks `transactionId` | A retried `POST` reuses the same id, so it can't create a duplicate ([ADR 0001](../adr/0001-client-generated-transaction-id.md)). |
| `202`, not `201`, for writes | The API only knows the event is stored, not that it's applied. A wrong-owner change is still `202` and lands in the DLQ ([ADR 0014](../adr/0014-transaction-ownership-in-db-writer.md)). |
| Create takes an array | Bulk import and offline sync can send many in one request. |
| `PUT` sends the whole transaction | The consumer handles create and update the same way (upsert), so an update that arrives first still gives the right row. |
| One service per write route | Each can scale, deploy and restart without touching the others. |
| `404` (not `403`) for someone else's category | Doesn't reveal that the id exists. |
