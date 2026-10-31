import { expect, Page, test } from '@playwright/test';
import { addTransaction, dialog, eventually, goTo, signUp } from './helpers';

// Add → edit → delete a transaction, and the reports that follow it -
// through the whole pipeline: event_store → CDC → Kafka → db-writer-service
// → transactions-db, plus the spend-summary-cache invalidation (item 5).
// Each check after a change reloads until the real result shows up (see
// `eventually`), since the page's own optimistic update would otherwise
// make it pass without the backend ever being involved.

// The transaction card containing `text` (cards are a role="list").
const card = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text });

test('add, edit, and delete a transaction, with reports following each change', async ({ page }) => {
  const year = String(new Date().getFullYear());
  await signUp(page);

  // A fresh user starts with nothing.
  await expect(page.getByText(`Total Spent in ${year}`)).toBeVisible();
  await expect(page.getByText('₹0.00')).toBeVisible();

  // --- add
  await goTo(page, 'View Transactions', 'View Transactions');
  await addTransaction(page, { category: 'Food & Dining', subcategory: 'Groceries', amount: '123.45', description: 'E2E groceries' });
  await eventually(page, async () => {
    await expect(card(page, 'E2E groceries')).toContainText('₹123.45');
    await expect(card(page, 'E2E groceries')).toContainText('Food & Dining / Groceries');
  });

  // --- edit
  await card(page, 'E2E groceries').getByRole('button', { name: 'Edit' }).click();
  const edit = dialog(page, 'Edit Transaction');
  await edit.getByLabel('Amount (₹)').fill('200');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await eventually(page, async () => {
    await expect(card(page, 'E2E groceries')).toContainText('₹200');
  });

  // --- reports reflect it (served from spend-summary-cache after the first read)
  await goTo(page, 'Home', 'Dashboard');
  await eventually(page, async () => {
    await expect(page.getByText('₹200.00').first()).toBeVisible();
  });
  await goTo(page, 'View Reports', 'View Reports');
  await expect(page.getByRole('row', { name: /Food & Dining\s+₹200\.00/ })).toBeVisible();

  // --- delete
  await goTo(page, 'View Transactions', 'View Transactions');
  await eventually(page, async () => {
    await expect(card(page, 'E2E groceries')).toBeVisible();
  });
  await card(page, 'E2E groceries').getByRole('button', { name: 'Delete' }).click();
  // Announced via the role="status" region (item 11).
  await expect(page.getByRole('status')).toHaveText('Transaction deleted.');
  await eventually(page, async () => {
    await expect(page.getByText('No transactions on this day.')).toBeVisible();
  });

  // --- the cached total was invalidated by the delete, not left stale
  await goTo(page, 'Home', 'Dashboard');
  await eventually(page, async () => {
    await expect(page.getByText('₹0.00')).toBeVisible();
  });
});

test("one user never sees another user's transactions", async ({ page }) => {
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  await addTransaction(page, { category: 'Transport', subcategory: 'Fuel', amount: '77.70', description: 'E2E private' });
  await eventually(page, async () => {
    await expect(card(page, 'E2E private')).toBeVisible();
  });

  await page.getByRole('button', { name: 'Log out' }).click();
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');

  await expect(page.getByText('No transactions on this day.')).toBeVisible();
  await expect(page.getByText('E2E private')).toHaveCount(0);
});
