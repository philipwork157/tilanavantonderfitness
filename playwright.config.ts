import { defineConfig } from '@playwright/test';

/** Dedicated ports and a fresh database prevent accidental reuse of a developer session. */
export default defineConfig({
  testDir: './tests/e2e',
  tsconfig: './tests/e2e/tsconfig.json',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:4310', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    // Simulated trusted ingress, configured only in the isolated Nuxt process.
    extraHTTPHeaders: { 'x-browser-fixture-ip': '127.0.0.1' } },
  webServer: {
    command: 'pnpm exec tsx --tsconfig tests/e2e/tsconfig.json tests/e2e/serve.ts',
    url: 'http://127.0.0.1:4312/ready',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
