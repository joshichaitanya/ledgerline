import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each test file starts its own Postgres container (Testcontainers) -
    // pulling the image the first time can take a while.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
