import { cp, copyFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDirectory = resolve('dist');
const clientDirectory = resolve('dist/client');
const serverDirectory = resolve('dist/server');

await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if (entry.name === 'client' || entry.name === 'server') continue;

  await cp(resolve(distDirectory, entry.name), resolve(clientDirectory, entry.name), {
    recursive: true,
  });
}

await mkdir(serverDirectory, { recursive: true });
await copyFile(resolve('worker/static.js'), resolve(serverDirectory, 'index.js'));
