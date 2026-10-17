import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from '@web/utils/security-headers';
import { robotsTxt } from '@web/utils/site-environment';

describe('security headers', () => {
  it('sends the same headers on prebuilt pages (public/_headers) as on pages rendered on request', () => {
    const file = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(file).toContain(`  ${name}: ${value}\n`);
  });

  it('never lets another site put the website in a frame', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
});

describe('robots.txt', () => {
  it('keeps search engines off the development copy only', () => {
    expect(robotsTxt(true, 'https://tilanavantonder.co.za/sitemap-index.xml')).toContain('Allow: /');
    expect(robotsTxt(true, 'https://tilanavantonder.co.za/sitemap-index.xml')).toContain('Sitemap: https://tilanavantonder.co.za/sitemap-index.xml');
    expect(robotsTxt(false, 'https://x.test/sitemap-index.xml')).toBe('User-agent: *\nDisallow: /\n');
  });
});
