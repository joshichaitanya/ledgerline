import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: the real web-app in a real browser, against the full
// running stack (api-gateway → services → event_store → CDC → Kafka →
// db-writer-service → transactions-db / spend-summary-cache). See README.md.

export const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:3100';
export const API_GATEWAY_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './tests',
  // Checks the backend is up before anything runs - fails fast with a clear
  // message instead of every test timing out one by one.
  globalSetup: './global-setup.ts',
  // Writes go through an async pipeline, so some steps wait up to ~30s for
  // a change to show up (see tests/helpers.ts) - give tests room for that.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Every test signs up its own fresh user, so tests can't see each other's
  // data and can safely run in parallel.
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Starts the web app's dev server if it isn't already running (e.g. via
  // `yarn frontend:up`). The backend is NOT started here - it's a whole
  // docker-compose stack; see README.md.
  webServer: {
    command: 'yarn --cwd .. frontend:up',
    url: `${WEB_APP_URL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
