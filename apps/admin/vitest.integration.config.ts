import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

/** Explicit opt-in: this suite migrates only an empty, disposable local database. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/**/*.integration.test.ts'],
    exclude: [],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
