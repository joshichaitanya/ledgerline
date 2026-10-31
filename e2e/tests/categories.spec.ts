import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import { addTransaction, dialog, goTo, openAddTransaction, signUp } from './helpers';

// The category picker's "Add" row (categories-service, docs/adr/0015).

test('add a custom category and subcategory from the picker; it gets selected', async ({ page }) => {
  const name = `E2E Hobby ${randomUUID().slice(0, 6)}`;
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  const add = await openAddTransaction(page);

  await add.getByRole('button', { name: 'Select Category' }).click();
  const picker = dialog(page, 'Select Category');
  await picker.getByLabel('New category').fill(name);
  await picker.getByRole('button', { name: 'Add', exact: true }).click();

  // The new category opens straight away, ready for a subcategory.
  const opened = dialog(page, name);
  await expect(opened.getByText('No subcategories yet.')).toBeVisible();
  await opened.getByLabel(`New subcategory in ${name}`).fill('Painting');
  await opened.getByRole('button', { name: 'Add', exact: true }).click();

  // …and the new subcategory is selected, closing the picker.
  await expect(opened).toBeHidden();
  await expect(add.getByRole('button', { name: `${name} / Painting` })).toBeVisible();
});

test('pressing Enter in the add field adds, without submitting the transaction form', async ({ page }) => {
  const name = `E2E Enter ${randomUUID().slice(0, 6)}`;
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  const add = await openAddTransaction(page);

  await add.getByRole('button', { name: 'Select Category' }).click();
  await dialog(page, 'Select Category').getByLabel('New category').fill(name);
  await page.keyboard.press('Enter');

  await expect(dialog(page, name)).toBeVisible();
  // The outer form wasn't submitted: still open, no validation errors shown.
  await expect(add).toBeVisible();
  await expect(add.getByText('Amount is required')).toHaveCount(0);
});

test('a name that already exists is rejected with a message', async ({ page }) => {
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  const add = await openAddTransaction(page);

  await add.getByRole('button', { name: 'Select Category' }).click();
  const picker = dialog(page, 'Select Category');
  await picker.getByLabel('New category').fill('food & dining');
  await picker.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(picker.getByRole('alert')).toContainText('already exists');
});

test("a user's custom category is private to them", async ({ page }) => {
  const name = `E2E Private ${randomUUID().slice(0, 6)}`;
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  let add = await openAddTransaction(page);
  await add.getByRole('button', { name: 'Select Category' }).click();
  await dialog(page, 'Select Category').getByLabel('New category').fill(name);
  await dialog(page, 'Select Category').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog(page, name)).toBeVisible();
  await page.keyboard.press('Escape'); // closes only the picker (item 11's nested-dialog handling)
  await expect(add).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toBeHidden();

  await page.getByRole('button', { name: 'Log out' }).click();
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  add = await openAddTransaction(page);
  await add.getByRole('button', { name: 'Select Category' }).click();

  const picker = dialog(page, 'Select Category');
  await expect(picker.getByRole('button', { name: 'Food & Dining' })).toBeVisible();
  await expect(picker.getByRole('button', { name })).toHaveCount(0);
});

// Regression: the picker renders inside the transaction form, and its
// buttons used to be submit buttons - in the (already valid) Edit dialog,
// clicking a category saved the edit at once, with the old category.
test('in the Edit dialog, clicking a category does not save the edit', async ({ page }) => {
  await signUp(page);
  await goTo(page, 'View Transactions', 'View Transactions');
  await addTransaction(page, { category: 'Food & Dining', subcategory: 'Cafe', amount: '9.99', description: 'E2E edit' });

  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = dialog(page, 'Edit Transaction');
  await edit.getByRole('button', { name: 'Food & Dining / Cafe' }).click();
  await dialog(page, 'Select Category').getByRole('button', { name: 'Transport', exact: true }).click();

  // Still choosing: the picker now shows Transport's subcategories, and the
  // Edit dialog is still open (it would have closed on save).
  await expect(dialog(page, 'Transport').getByRole('button', { name: 'Fuel' })).toBeVisible();
  await expect(edit).toBeVisible();
});
