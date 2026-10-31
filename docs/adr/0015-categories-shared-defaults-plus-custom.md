# 15. Categories: shared defaults plus each user's own, served by one `categories-service`

**Status:** Accepted (see `services/categories-service`)

**Context:** Categories and subcategories came from mock data in `get-categories-service`. The real rows in `reference-db` were filled by a one-off seed script, and there was no way to add a category. Two questions needed answering: who owns a category, and where its create/list APIs live.

**Decision:**
- **Ownership:** a default list everyone sees, plus categories and subcategories each user adds for themselves. Only the user who added them sees them. `categories.user_id` and `subcategories.user_id` are `NULL` for shared defaults, and the owner's id ([ADR 0012](0012-auth-db-user-id-everywhere.md)) otherwise. A user can add a subcategory under a default category or under one of their own categories, but not under someone else's.
- **Defaults:** they're a `reference-db` migration, not a seed script, so every environment gets the same list (with the same ids) just by migrating.
- **Service:** `get-categories-service` is renamed `categories-service`. It handles both reading and creating, writing straight to `reference-db`, and it owns `reference-db`'s migrations (moved from `db-writer-service`).

**Consequences:**
- One user's additions never clutter anyone else's picker.
- Categories don't use the event pipeline or separate write services, unlike transactions. They're low-traffic reference data, so the extra moving parts (event store, CDC, consumer) would buy nothing here. This is a deliberate exception to the "one service per write path" pattern used for transactions.
- `transactions.subcategory_id` still isn't checked against `reference-db`, because Postgres can't enforce a foreign key across databases. Transactions now carry real subcategory ids (uuids) instead of mock ids like `'groceries'`. Older test rows with mock ids will show up as "Other" in reports.
- Names must be unique within what one user sees, case-insensitive: a user can't add a second "Food & Dining", whether as their own or alongside the default.
