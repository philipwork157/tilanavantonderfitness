import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceDirectory = resolve('apps/web/dist');
const targetDirectory = resolve('dist');

await rm(targetDirectory, { force: true, recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true });
