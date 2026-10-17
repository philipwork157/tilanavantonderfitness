import { describe, expect, it } from 'vitest';
import { alwaysOpen, maintenanceOn, maintenanceResponse, PREVIEW_COOKIE } from '@web/maintenance';

const TOKEN = 'a-long-enough-secret-token';
const on = { MAINTENANCE_MODE: 'on', MAINTENANCE_BYPASS_TOKEN: TOKEN };
const site = 'https://tilanavantonder.co.za';

/** The cookie a browser keeps after ?preview=<token>. */
async function previewCookie(): Promise<string> {
  const response = await maintenanceResponse(new Request(`${site}/?preview=${TOKEN}`), on);
  return response!.headers.get('set-cookie')!.split(';')[0]!;
}

describe('maintenance switch', () => {
  it('is on only for clear "on" values', () => {
    for (const value of ['on', 'ON', 'true', '1', 'yes', ' on ']) expect(maintenanceOn({ MAINTENANCE_MODE: value })).toBe(true);
    for (const value of [undefined, '', 'off', 'false', '0', 'maybe']) expect(maintenanceOn({ MAINTENANCE_MODE: value })).toBe(false);
  });

  it('leaves the website alone when it is off', async () => {
    expect(await maintenanceResponse(new Request(`${site}/program`), { MAINTENANCE_BYPASS_TOKEN: TOKEN })).toBeNull();
  });
});

describe('while maintenance is on', () => {
  it('answers every page with the 503 maintenance page, kept out of search results and caches', async () => {
    for (const path of ['/', '/program', '/contact', '/about', '/checkout', '/blog/some-post']) {
      const response = await maintenanceResponse(new Request(`${site}${path}`), on);
      expect(response?.status).toBe(503);
      expect(response?.headers.get('cache-control')).toBe('no-store');
      expect(response?.headers.get('x-robots-tag')).toBe('noindex');
      expect(response?.headers.get('retry-after')).toBe('3600');
      expect(await response!.text()).toContain('Back <em>very soon.</em>');
    }
  });

  it('keeps unsubscribing, robots.txt and the after-payment page working', async () => {
    for (const path of ['/robots.txt', '/newsletter/one-click', '/newsletter/unsubscribe', '/checkout/complete']) {
      expect(alwaysOpen(path)).toBe(true);
      expect(await maintenanceResponse(new Request(`${site}${path}`, { method: path.endsWith('one-click') ? 'POST' : 'GET' }), on)).toBeNull();
    }
    expect(alwaysOpen('/checkout')).toBe(false);
    expect(alwaysOpen('/newsletters-are-great')).toBe(false);
  });

  it('lets a browser with the preview cookie see the real site', async () => {
    const cookie = await previewCookie();
    expect(cookie.startsWith(`${PREVIEW_COOKIE}=`)).toBe(true);
    expect(cookie).not.toContain(TOKEN);
    expect(await maintenanceResponse(new Request(`${site}/program`, { headers: { cookie } }), on)).toBeNull();
  });

  it('does not accept a made-up or old cookie', async () => {
    const forged = await maintenanceResponse(new Request(`${site}/`, { headers: { cookie: `${PREVIEW_COOKIE}=${TOKEN}` } }), on);
    expect(forged?.status).toBe(503);
    const cookie = await previewCookie();
    const rotated = { ...on, MAINTENANCE_BYPASS_TOKEN: 'a-brand-new-secret-token-123' };
    expect((await maintenanceResponse(new Request(`${site}/`, { headers: { cookie } }), rotated))?.status).toBe(503);
  });
});

describe('?preview=', () => {
  it('sets a 12-hour, script-proof cookie and returns to the same page without the token in the address', async () => {
    const response = await maintenanceResponse(new Request(`${site}/program?volume=2&preview=${TOKEN}`), on);
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/program?volume=2');
    const cookie = response!.headers.get('set-cookie')!;
    expect(cookie).toContain('Max-Age=43200');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('?preview=off removes the cookie', async () => {
    const response = await maintenanceResponse(new Request(`${site}/?preview=off`), on);
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('a wrong token gets the maintenance page like everyone else', async () => {
    expect((await maintenanceResponse(new Request(`${site}/?preview=guess`), on))?.status).toBe(503);
  });

  it('is off without a long enough token, so a short or empty secret never opens the site', async () => {
    for (const token of [undefined, '', 'short']) {
      const env = { MAINTENANCE_MODE: 'on', MAINTENANCE_BYPASS_TOKEN: token };
      expect((await maintenanceResponse(new Request(`${site}/?preview=${token ?? ''}`), env))?.status).toBe(503);
    }
  });
});
