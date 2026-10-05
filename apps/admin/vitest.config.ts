import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database tests share one throwaway database, so run files one at a time.
    fileParallelism: false,
  },
});
