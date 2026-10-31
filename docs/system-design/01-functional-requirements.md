# Functional requirements

What a user can do with Ledgerline.

## Accounts

| # | Requirement | Where |
|---|---|---|
| FR-1 | A user can sign up with name, email and password. Email must be unique. | `auth-service` `POST /signup` |
| FR-2 | A user can log in and get a short-lived access token (15 min) plus a refresh token (30 days, httpOnly cookie). | `POST /login` |
| FR-3 | A user stays logged in by swapping the refresh token for a new access token. The old refresh token stops working (rotation). | `POST /refresh` |
| FR-4 | A user can log out of the current session. | `POST /logout` |
| FR-5 | A user can change their password. This logs them out everywhere. | `PUT /change-password` |

## Transactions

| # | Requirement | Where |
|---|---|---|
| FR-6 | A user can add one or more transactions in one request (amount, description, date, subcategory). The client picks each transaction id, so a retry never makes a duplicate. | `create-transaction-service` `POST /transactions` |
| FR-7 | A user can edit a transaction they own. | `update-transaction-service` `PUT /transactions/:id` |
| FR-8 | A user can delete a transaction they own. A deleted transaction never comes back, even if an older edit arrives late. | `delete-transaction-service` `DELETE /transactions/:id` |
| FR-9 | A user can list their own transactions, newest first. Deleted ones are hidden. | `get-transactions-service` `GET /transactions` |
| FR-10 | A user can see spend totals per subcategory for one month, or for all 12 months of a year. | `GET /transactions/summary` |
| FR-11 | A user can never see, change or delete another user's transaction. | Token-based user id + owner check in `db-writer-service` |

## Categories

| # | Requirement | Where |
|---|---|---|
| FR-12 | Every user sees the same 12 default categories and their subcategories. | `categories-service` `GET /categories` |
| FR-13 | A user can add their own categories and subcategories. Only they see them. | `POST /categories`, `POST /categories/:id/subcategories` |
| FR-14 | Names are unique (ignoring case) within what one user sees. | `categories-service` |

## Out of scope (for now)

- Budgets, alerts, multiple currencies, shared accounts.
- Editing or deleting categories.
- Re-publishing a fixed event from the DLQ (see `docs/TODO.md`).
