import base from '../../apps/web/astro.config.mjs';
import { fileURLToPath } from 'node:url';

/** Test-only caches prevent interference with managed development/typecheck processes. */
export default {
  ...base,
  cacheDir: fileURLToPath(new URL('../../.cache/e2e-astro', import.meta.url)),
  devToolbar: { enabled: false },
  vite: {
    ...base.vite,
    envDir: fileURLToPath(new URL('../../.cache/e2e-env', import.meta.url)),
    cacheDir: fileURLToPath(new URL('../../.cache/e2e-vite', import.meta.url)),
  },
};
