import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { goTo, openAddTransaction, signUp } from './helpers';

// Item 11's fixes, checked automatically so they can't quietly regress:
// axe (WCAG 2.1 A/AA rules) on every page and dialog, in both themes, plus
// the keyboard behaviour axe can't see (skip link, focus traps, Escape,
// focus return).

async function expectNoAxeViolations(page: Page, label: string) {
  // Dialogs fade in (0.3s). Measured mid-fade, their text is still partly
  // transparent and axe reports contrast failures that don't exist once shown.
  // allSettled: an animation cancelled mid-way (e.g. replaced by a page
  // change) rejects its `finished` promise - that's fine, it's not running.
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  // Summarised, so a failure says what and where instead of dumping the whole report.
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  const current = await page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'light');
  if (current !== theme) {
    await page.getByRole('button', { name: /theme|dark|light/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    test('public pages', async ({ page }) => {
      for (const path of ['/login', '/register', '/about']) {
        await page.goto(path);
        await setTheme(page, theme);
        await expectNoAxeViolations(page, `${path} (${theme})`);
      }
    });

    test('logged-in pages and dialogs', async ({ page }) => {
      await signUp(page);
      await setTheme(page, theme);
      await expectNoAxeViolations(page, `Dashboard (${theme})`);

      for (const [link, heading] of [
        ['View Reports', 'View Reports'],
        ['Change Password', 'Change Password'],
        ['View Transactions', 'View Transactions'],
      ]) {
        await goTo(page, link, heading);
        await expectNoAxeViolations(page, `${heading} (${theme})`);
      }

      const add = await openAddTransaction(page);
      await expectNoAxeViolations(page, `Add Transaction dialog (${theme})`);
      await add.getByRole('button', { name: 'Select Category' }).click();
      await expectNoAxeViolations(page, `category picker (${theme})`);
    });
  });
}

test.describe('keyboard', () => {
  test('the first Tab reaches "Skip to content", which moves focus to the main content', async ({ page }) => {
    await page.goto('/about');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
  });

  test('a dialog traps Tab, closes on Escape, and returns focus to its opener', async ({ page }) => {
    await signUp(page);
    await goTo(page, 'View Transactions', 'View Transactions');
    const opener = page.getByRole('button', { name: '+ Add Transaction' });
    const add = await openAddTransaction(page);

    // Focus starts inside the dialog, and stays there however far you Tab
    // (both directions).
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await add.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await add.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(add).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('labels are linked to their inputs (clicking a label focuses its input)', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Email', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused();
  });
});

test.describe('mobile sidebar', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('opens as a dialog, traps focus, closes on Escape, and is unreachable by Tab when closed', async ({ page }) => {
    await signUp(page);
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');

    // Closed: Tabbing through the page never lands inside the (off-screen) sidebar.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#sidebar'))).toBe(false);
    }

    await hamburger.click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(hamburger).toBeFocused();
  });
});
