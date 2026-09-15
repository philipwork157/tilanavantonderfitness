import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

const apiDirectory = fileURLToPath(new URL('../server/api/', import.meta.url));
const mutationRoutePattern = /\.(?:post|patch|put|delete)\.ts$/;
const approvedProtectionPattern = /(?:requireAdminMutation|requireAdminCatalogueMutation|enforceSameOrigin|applyContactCors|x-paystack-signature)/;

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return extname(entry.name) === '.ts' ? [path] : [];
  }));
  return files.flat();
}

describe('state-changing API route security', () => {
  it('keeps an approved request-boundary guard on every mutation route', async () => {
    const routes = (await listTypeScriptFiles(apiDirectory)).filter(route => mutationRoutePattern.test(route));
    assert.ok(routes.length >= 20, 'Expected the Nuxt API mutation routes to be discovered.');

    const unprotected: string[] = [];
    for (const route of routes) {
      const source = await readFile(route, 'utf8');
      if (!approvedProtectionPattern.test(source)) {
        unprotected.push(route.slice(apiDirectory.length));
      }
    }

    assert.deepEqual(unprotected, []);
  });
});
