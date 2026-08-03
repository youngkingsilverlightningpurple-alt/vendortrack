/**
 * @fileOverview Smoke Test Configuration
 *
 * Separate vitest config for smoke tests that run against
 * a live server (not unit tests).
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/smoke/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Smoke tests run sequentially to avoid rate limiting
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
