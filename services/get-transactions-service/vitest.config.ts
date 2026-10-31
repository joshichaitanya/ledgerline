import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Test files start their own Postgres/Redis containers (Testcontainers) -
    // pulling the images the first time can take a while.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
