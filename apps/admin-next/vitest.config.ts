import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 'server-only' throws outside Next's server bundle; tests run server code directly.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  // Database tests share one throwaway database (and truncate tables), so test files run one at a time.
  test: { include: ['src/**/*.test.ts'], fileParallelism: false },
});
