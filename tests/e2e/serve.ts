import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { createPaystackTestDatabase } from '@fixtures/database';
import { programFiles, programMedia, programs, programVolumes } from '@tilana/db/schema';
import { createProviders } from './providers';

// Refuse existing servers rather than silently testing another developer's session.
for (const port of [4310, 4311, 4312]) {
  await new Promise<void>((accept, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : accept()));
  });
}
// The helper refuses missing, remote, nonempty or incorrectly named databases.
process.env.PAYSTACK_TEST_DATABASE_URL = process.env.E2E_DATABASE_URL;
const database = await createPaystackTestDatabase();
for (let index = 1; index <= 3; index++) {
  const [program] = await database.insert(programs).values({ slug: `browser-program-${index}`, name: `Browser Program ${index}`, status: 'published', headline: `Browser Program ${index}`, cardLabel: 'Programme', description: 'Browser fixture programme', accent: 'sage' }).returning();
  await database.insert(programMedia).values({ programId: program!.id, displayName: 'Cover', altText: 'Fixture cover', r2Bucket: 'browser-public', r2ObjectKey: `cover-${index}.png`, contentType: 'image/png', uploadStatus: 'ready' });
  const [volume] = await database.insert(programVolumes).values({ programId: program!.id, slug: `browser-volume-${index}`, name: `Browser Volume ${index}`, volumeNumber: 1, currentPriceCents: index * 10000, isPublished: true }).returning();
  await database.insert(programFiles).values({ programVolumeId: volume!.id, displayName: `Guide ${index}`, r2Bucket: 'browser-private', r2ObjectKey: `guide-${index}.pdf`, contentType: 'application/pdf', uploadStatus: 'ready' });
}
const providers = createProviders(database);
await new Promise<void>((accept, reject) => { providers.server.once('error', reject); providers.server.listen(4312, '127.0.0.1', accept); });

// Never inherit real credentials, developer .env files, or deployment identity.
const base = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(NUXT_|PUBLIC_|AWS_|FLY_|DATABASE_URL|NODE_OPTIONS)/.test(key)));
const admin = spawn('pnpm', ['exec', 'nuxt', 'dev', '--extends', '../../tests/e2e', '--dotenv', '/dev/null', '--host', '127.0.0.1', '--port', '4311'], {
  cwd: resolve('apps/admin'), stdio: 'inherit', env: {
    ...base, NODE_ENV: 'development', NUXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `--import=${resolve('tests/e2e/network.mjs')}`,
    NUXT_DATABASE_URL: process.env.E2E_DATABASE_URL!,
    NUXT_TRUSTED_CLIENT_IP_HEADER: 'x-browser-fixture-ip', NUXT_CONTACT_ALLOWED_ORIGINS: 'http://127.0.0.1:4310',
    NUXT_CONTACT_IP_HASH_SECRET: 'browser-fixture-secret-not-a-production-secret',
    NUXT_TURNSTILE_SECRET_KEY: 'fixture', NUXT_CONTACT_TURNSTILE_REQUIRED: 'true',
    NUXT_PAYSTACK_SECRET_KEY: 'sk_test_browser_fixture', NUXT_PAYSTACK_ENVIRONMENT: 'test',
    NUXT_PAYSTACK_CALLBACK_URL: 'http://127.0.0.1:4310/checkout/complete',
    NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:4310', NUXT_ACCOUNT_BASE_URL: 'http://127.0.0.1:4311',
    NUXT_SUPABASE_URL: 'http://127.0.0.1:4312', NUXT_SUPABASE_PUBLISHABLE_KEY: 'fixture', NUXT_SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT: 'inbox@example.test', NUXT_EMAIL_FROM_ADDRESS: 'sender@example.test',
    AWS_REGION: 'eu-west-1', AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture',
    AWS_ENDPOINT_URL: 'http://127.0.0.1:4312', AWS_EC2_METADATA_DISABLED: 'true',
    NUXT_R2_PUBLIC_MEDIA_BUCKET: 'browser-public', NUXT_R2_PUBLIC_MEDIA_BASE_URL: 'https://media.example.test', NUXT_R2_PRIVATE_PROGRAM_BUCKET: 'browser-private',
    NUXT_R2_ACCOUNT_ID: 'fixture', NUXT_R2_DOWNLOAD_ACCESS_KEY_ID: 'fixture', NUXT_R2_DOWNLOAD_SECRET_ACCESS_KEY: 'fixture',
  },
});
const web = spawn('pnpm', ['exec', 'astro', 'dev', '--config', '../../tests/e2e/astro.config.mjs', '--ignore-lock', '--host', '127.0.0.1', '--port', '4310'], {
  cwd: resolve('apps/web'), stdio: 'inherit', env: {
    ...base, ASTRO_DEV_BACKGROUND: '1', ASTRO_TELEMETRY_DISABLED: '1', PUBLIC_CATALOGUE_API_BASE_URL: 'http://127.0.0.1:4311/api/public',
    PUBLIC_CHECKOUT_API_URL: 'http://127.0.0.1:4311/api/checkout/paystack',
    PUBLIC_CHECKOUT_STATUS_API_URL: 'http://127.0.0.1:4311/api/checkout/status',
    PUBLIC_ACCOUNT_URL: 'http://127.0.0.1:4311/account/sign-in', PUBLIC_TURNSTILE_SITE_KEY: 'browser-fixture',
  },
});
/** Bound readiness without reusing any existing process on these ports. */
async function waitFor(url: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (admin.exitCode !== null || web.exitCode !== null) throw new Error('A browser test server exited before readiness.');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* Server still compiling. */ }
    await new Promise(accept => setTimeout(accept, 1000));
  }
  throw new Error(`Browser test server unavailable: ${url}`);
}
async function stop() {
  admin.kill('SIGTERM'); web.kill('SIGTERM'); providers.server.close();
  await database.$client.end();
}
process.once('SIGTERM', () => { void stop().then(() => process.exit()); });
process.once('SIGINT', () => { void stop().then(() => process.exit()); });
try {
  await Promise.all([waitFor('http://127.0.0.1:4310/checkout'), waitFor('http://127.0.0.1:4311/account/sign-in')]);
  providers.markReady();
} catch (error) { await stop(); throw error; }
