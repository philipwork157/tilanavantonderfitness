import { describe, expect, it } from 'vitest';
import { publicApiUrl } from '@web/utils/public-api';
import { spawnSync } from 'node:child_process';

describe('single public backend origin', () => {
  it.each(['/api/contact', '/api/newsletter/subscribe', '/api/newsletter/unsubscribe', '/api/public/programs', '/api/checkout/paystack', '/api/checkout/status', '/account/sign-in'])('derives endpoint %s', path => {
    expect(publicApiUrl(path, 'https://admin.example.test/')).toBe(`https://admin.example.test${path}`);
  });
  it.each(['invalid', 'https://user:secret@admin.example.test', 'https://admin.example.test/api', 'https://admin.example.test?next=other', 'https://admin.example.test#fragment', 'ftp://admin.example.test'])('rejects invalid origin %s', base => {
    expect(() => publicApiUrl('/api/contact', base)).toThrow();
  });
  it.each([
    ['development', 'https://admin-dev.tilanavantonder.co.za', true],
    ['production', 'https://admin.tilanavantonder.co.za', true],
    ['production', 'https://admin-dev.tilanavantonder.co.za', false],
    ['development', 'http://127.0.0.1:3001', false],
    ['development', '', false],
    ['production', 'https://user:secret@admin.tilanavantonder.co.za', false],
    ['production', 'https://admin.tilanavantonder.co.za/api', false],
  ])('validates deployed %s origin %s', (deployment, base, valid) => {
    const result = spawnSync(process.execPath, ['scripts/validate-public-deployment-env.mjs'], { env: { ...process.env, DEPLOYMENT_ENVIRONMENT: deployment, PUBLIC_API_BASE_URL: base, PUBLIC_TURNSTILE_SITE_KEY: 'fixture' } });
    expect(result.status === 0).toBe(valid);
  });
});
