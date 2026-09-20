import { fileURLToPath } from 'node:url';

/** Test-only layer changes generated-output locations, not API or authentication code. */
export default {
  // CLI --extends replaces the root layer list; retain the real shared UI layer.
  extends: ['../../packages/ui-nuxt'],
  buildDir: fileURLToPath(new URL('../../.cache/e2e-nuxt', import.meta.url)),
};
