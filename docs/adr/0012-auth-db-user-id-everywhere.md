# 12. One user id everywhere: the `auth-db` account id

**Status:** Accepted (see `services/auth-service`, `docs/TODO.md` item 9)

**Context:** Two unrelated `users` tables exist. `auth-db.users` holds login accounts (id, name, email, password hash), created on sign-up. `reference-db.users` holds demo profiles (id, name, email, phone, city, country) loaded by a seed script. Nothing links the two. Their ids come from different sequences, so "user 1" means a different person in each. Transactions used a hardcoded `userId: 1` from the second table, so they couldn't be tied to whoever was actually logged in. There were two options: (A) make the `auth-db` account id the only user id, and retire `reference-db.users`; or (B) keep both, and have sign-up also create a `reference-db` profile row with the same id.

**Decision:** Option A. The `auth-db` account id (the `userId` in every access token) is the one user id used by transactions, categories, and the spend cache. `reference-db.users` is dropped, together with the seed script that filled it.

**Consequences:**
- There's nothing to reconcile, because there's only one id. The question "which table does this id refer to" goes away, instead of being solved by syncing two tables.
- `auth-service` still writes to only its own database. Option B would have made sign-up write to two databases, with no transaction across them.
- The demo profile fields (phone, city, country) are gone. Nothing in the app used them. If a profile is needed later, it belongs with the account (in `auth-service`), or in a profile service keyed by this same id.
- Existing test data in `transactions-db` that used demo ids (1, 777, 790, …) doesn't belong to any real account. That's harmless for a demo; a clean slate removes it.
