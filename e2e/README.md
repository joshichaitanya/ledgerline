# e2e

End-to-end tests with [Playwright](https://playwright.dev): the real `web-app` in a real browser (Chromium), against the full running stack — `api-gateway` → services → `event_store` → CDC → Kafka → `db-writer-service` → `transactions-db` / `spend-summary-cache`. The service-level tests (`yarn test`, `docs/TODO.md` item 6) check each service on its own; these check that everything works together the way a user sees it.

## Running

1. Start the **whole** backend, not just `yarn backend:up` — transactions only reach `transactions-db` through Kafka, CDC, and `db-writer-service`:
   ```
   docker compose up -d --build
   ```
   (Migrations run automatically on `up`.)
2. Install Playwright's browser (once):
   ```
   yarn --cwd e2e playwright install chromium
   ```
3. Run:
   ```
   yarn e2e
   ```
   The web app (`localhost:3100`) is started automatically if it isn't already running (`yarn frontend:up` is reused if it is). A check runs first and stops everything with instructions if `api-gateway` isn't reachable.

`yarn --cwd e2e test:ui` opens Playwright's UI mode; after a failed run, `yarn --cwd e2e report` shows the HTML report with screenshots and traces.

## What's covered

| File | Covers |
|---|---|
| `auth.spec.ts` | Sign up → log out → log in; logged-out redirects and hidden nav; wrong password; change password (old one stops working, new one works) |
| `transactions.spec.ts` | Add → edit → delete a transaction, each change checked after it's gone through the pipeline; Home and View Reports totals follow (and drop back after the delete — i.e. the cached total was invalidated); one user can't see another's transactions |
| `categories.spec.ts` | Adding a custom category + subcategory from the picker (and it gets selected); Enter adds without submitting the outer form; duplicate names rejected; custom categories are private; regression test for the Edit dialog saving early |
| `accessibility.spec.ts` | axe (WCAG 2.1 A/AA) on every page and dialog in light and dark themes; skip link; dialog focus trap / Escape / focus return; labels linked to inputs; mobile sidebar as a dialog, unreachable by Tab when closed |

## How the tests are written

- **A fresh user per test** (`signUp` in `tests/helpers.ts`), so tests never share data, can run in parallel, and nothing needs resetting between runs.
- **Writes are asynchronous.** After a change, tests use `eventually(...)`: reload until the expected result shows (up to 30s). That way they check the real stored result, not just the page's own instant optimistic update.
- **Elements are found the way a user finds them** — by label, role, and visible text (`getByLabel`, `getByRole`). That only works when the accessibility basics are right, so it doubles as a check on them.

## Not done yet

- Not in CI (there's no CI yet).
- Chromium only.
- The test users stay in the databases afterwards; `yarn clean-slate` wipes everything.
