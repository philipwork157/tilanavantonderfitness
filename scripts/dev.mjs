import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const stateDirectory = path.join(rootDirectory, '.turbo');
const stateFile = path.join(stateDirectory, 'dev-state.json');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const readState = async () => {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    return null;
  }
};

const isRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const removeState = async () => {
  try {
    await unlink(stateFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const stopAstroFallback = () => {
  spawnSync(
    pnpmCommand,
    ['--filter', '@tilana/web', 'exec', 'astro', 'dev', 'stop'],
    {
      cwd: rootDirectory,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      stdio: 'ignore',
    },
  );
};

const stopDevelopmentServers = async () => {
  const state = await readState();
  const runnerPid = state?.runnerPid;
  const turboPid = state?.turboPid;

  if (isRunning(runnerPid)) {
    process.kill(runnerPid, 'SIGTERM');
  } else if (isRunning(turboPid)) {
    process.kill(turboPid, 'SIGTERM');
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isRunning(runnerPid) && !isRunning(turboPid)) break;
    await wait(100);
  }

  stopAstroFallback();
  await removeState();
  console.log('Local development servers stopped.');
};

if (process.argv.includes('--stop')) {
  await stopDevelopmentServers();
  process.exit(0);
}

const previousState = await readState();
if (isRunning(previousState?.runnerPid) || isRunning(previousState?.turboPid)) {
  console.log('Local development servers are already running.');
  console.log('Use "pnpm dev:stop" before starting them again.');
  process.exit(0);
}

await removeState();
await mkdir(stateDirectory, { recursive: true });

const turbo = spawn(pnpmCommand, ['exec', 'turbo', 'run', 'dev'], {
  cwd: rootDirectory,
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    NUXT_TELEMETRY_DISABLED: '1',
  },
  stdio: 'inherit',
});

await writeFile(
  stateFile,
  `${JSON.stringify({ runnerPid: process.pid, turboPid: turbo.pid }, null, 2)}\n`,
);

let shuttingDown = false;
const forwardSignal = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (turbo.exitCode === null) turbo.kill(signal);
};

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

turbo.once('error', async (error) => {
  await removeState();
  console.error(`Unable to start local development servers: ${error.message}`);
  process.exit(1);
});

turbo.once('exit', async (code) => {
  await removeState();
  process.exit(code ?? 0);
});
