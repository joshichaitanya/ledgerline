import { randomUUID } from 'crypto';
import { expect, Locator, Page } from '@playwright/test';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

// A brand-new account per test, so tests never share data and nothing needs
// resetting between runs.
export function newUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return { name: `E2E ${id}`, email: `e2e-${id}@example.com`, password: 'password123' };
}

// Every form field is found by its visible label - which only works because
// labels are properly linked to inputs (item 11), so this checks that too.
export async function signUp(page: Page, user: TestUser = newUser()): Promise<TestUser> {
  await page.goto('/register');
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return user;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
}

export async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function goTo(page: Page, linkName: string, heading: string) {
  await page.getByRole('navigation').getByRole('link', { name: linkName }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

// Writes reach transactions-db asynchronously (event_store → CDC → Kafka →
// db-writer-service), usually within a few seconds. Reload until `check`
// passes, so a test waits for the real result instead of assuming it's
// instant - and fails if it never shows up.
export async function eventually(page: Page, check: () => Promise<void>, timeout = 30_000) {
  await expect(async () => {
    await page.reload();
    await check();
  }).toPass({ timeout, intervals: [1_000, 2_000, 3_000] });
}

export const dialog = (page: Page, name: string): Locator => page.getByRole('dialog', { name });

// Opens "+ Add Transaction" and returns the dialog.
export async function openAddTransaction(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '+ Add Transaction' }).click();
  const add = dialog(page, 'Add Transaction');
  await expect(add).toBeVisible();
  return add;
}

// Picks category › subcategory in the (nested) category picker dialog.
export async function pickCategory(page: Page, form: Locator, category: string, subcategory: string) {
  await form.getByRole('button', { name: /Select Category|\// }).click();
  const picker = dialog(page, 'Select Category');
  await picker.getByRole('button', { name: category, exact: true }).click();
  await dialog(page, category).getByRole('button', { name: subcategory, exact: true }).click();
  await expect(form.getByRole('button', { name: `${category} / ${subcategory}` })).toBeVisible();
}

// Adds a transaction for today through the UI.
export async function addTransaction(page: Page, t: { category: string; subcategory: string; amount: string; description: string }) {
  const add = await openAddTransaction(page);
  await pickCategory(page, add, t.category, t.subcategory);
  await add.getByLabel('Amount (₹)').fill(t.amount);
  await add.getByLabel('Description (optional)').fill(t.description);
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(add).toBeHidden();
}
