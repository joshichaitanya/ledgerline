# categories-service

Lists and creates categories and subcategories, in `reference-db`. It replaced `get-categories-service`, which only served mock data. See [ADR 0015](../../docs/adr/0015-categories-shared-defaults-plus-custom.md).

- **Shared defaults + each user's own.** Everyone sees the 12 default categories. A user can add their own categories, and their own subcategories under either a default or one of their own categories. Only they see what they add. In the database, `user_id` is `NULL` for a default and the owner's id otherwise.
- **Defaults come from a migration** (`migrations/1700000000002_default_categories.js`), not a seed script, so every environment has the same list with the same ids.
- Writes go straight to `reference-db`, not through the event pipeline. Categories are low-traffic reference data.

## API

Every route needs an access token (`Authorization: Bearer ...`). The user is always taken from the token ([ADR 0013](../../docs/adr/0013-user-id-from-verified-token.md)).

| Route | Does | Errors |
|---|---|---|
| `GET /categories` | Defaults + the user's own, each with the subcategories the user can see. Each item has `custom: true/false`. Oldest first, so defaults come first. | `401` |
| `POST /categories` `{ name }` | Adds a category only this user sees. `201` with the new category. | `400` bad name · `409` name already visible to this user (any case) |
| `POST /categories/:categoryId/subcategories` `{ name }` | Adds a subcategory under a default or the user's own category. `201` with it. | `400` · `404` category not found, or another user's (same answer, so it isn't revealed) · `409` |

Names are trimmed and must be 1–100 characters.

## Running

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/reference_db yarn --cwd services/categories-service migrate:up
yarn --cwd services/categories-service test
```

This service owns `reference-db`'s migrations (moved from `db-writer-service`; same `reference_migrations` table, so already-applied ones aren't re-run). The last migration also drops `reference-db`'s old demo `users` table ([ADR 0012](../../docs/adr/0012-auth-db-user-id-everywhere.md)).

## Not done yet

- A transaction's `subCategoryId` isn't checked against `reference-db` (different database, no foreign key possible).
- No rename or delete of categories.
