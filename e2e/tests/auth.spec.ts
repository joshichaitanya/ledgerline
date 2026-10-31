import { expect, test } from '@playwright/test';
import { goTo, logIn, logOut, signUp } from './helpers';

// Sign-up → log out → log in → change password, through the real UI
// (docs/TODO.md item 9).

test('sign up, log out, and log back in', async ({ page }) => {
  const user = await signUp(page);

  // The sidebar shows the real logged-in account.
  await expect(page.getByText(user.email)).toBeVisible();

  await logOut(page);
  // Account-only nav is hidden while logged out (About Us stays).
  await expect(page.getByRole('link', { name: 'View Transactions' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'About Us' })).toBeVisible();

  await logIn(page, user.email, user.password);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

test('account pages redirect to login when logged out', async ({ page }) => {
  await page.goto('/view-transactions');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password is rejected with a message', async ({ page }) => {
  const user = await signUp(page);
  await logOut(page);

  await logIn(page, user.email, 'not-the-password');

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('change password: the old one stops working, the new one works', async ({ page }) => {
  const user = await signUp(page);
  const newPassword = 'new-password-456';

  await goTo(page, 'Change Password', 'Change Password');
  await page.getByLabel('Current Password').fill(user.password);
  await page.getByLabel('New Password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm New Password').fill(newPassword);
  await page.getByRole('button', { name: 'Change Password' }).click();

  // Changing the password ends every session, this one included.
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, user.email, user.password);
  await expect(page.getByRole('alert')).toBeVisible();

  await logIn(page, user.email, newPassword);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

test('change password with the wrong current password shows an error', async ({ page }) => {
  await signUp(page);

  await goTo(page, 'Change Password', 'Change Password');
  await page.getByLabel('Current Password').fill('wrong-current');
  await page.getByLabel('New Password', { exact: true }).fill('whatever-789');
  await page.getByLabel('Confirm New Password').fill('whatever-789');
  await page.getByRole('button', { name: 'Change Password' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/change-password$/);
});
