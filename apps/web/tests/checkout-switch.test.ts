import { describe, expect, it } from 'vitest';
import { CHECKOUT_HEADER, checkoutFromHeader, checkoutMode, checkoutOpen } from '@web/checkout-switch';
import { maintenanceResponse } from '@web/maintenance';
import { programFaqs } from '@web/site/data';

const TOKEN = 'a-long-enough-secret-token';
const site = 'https://tilanavantonder.co.za';

/** The cookie a browser keeps after ?preview=<token> (works whether maintenance is on or off). */
async function previewCookie(): Promise<string> {
  const response = await maintenanceResponse(new Request(`${site}/?preview=${TOKEN}`), { MAINTENANCE_BYPASS_TOKEN: TOKEN });
  return response!.headers.get('set-cookie')!.split(';')[0]!;
}

describe('CHECKOUT_MODE', () => {
  it('reads on, off and not set', () => {
    for (const value of ['on', ' ON ', 'true', '1', 'yes', 'enabled']) expect(checkoutMode(value)).toBe(true);
    for (const value of ['off', 'false', '0', 'no', 'disabled', 'disable checkout']) expect(checkoutMode(value)).toBe(false);
    for (const value of [undefined, null, '', '   ']) expect(checkoutMode(value)).toBeNull();
  });

  it('never opens the checkout on a typo', () => {
    expect(checkoutMode('of')).toBe(false);
    expect(checkoutMode('maybe')).toBe(false);
  });
});

describe('who sees the checkout', () => {
  const page = new Request(`${site}/program`);

  it('follows the Cloudflare variable over the build setting', async () => {
    expect(await checkoutOpen(page, { CHECKOUT_MODE: 'off' }, true)).toBe(false);
    expect(await checkoutOpen(page, { CHECKOUT_MODE: 'on' }, false)).toBe(true);
  });

  it('uses the build setting when the variable is not set', async () => {
    expect(await checkoutOpen(page, {}, true)).toBe(true);
    expect(await checkoutOpen(page, { CHECKOUT_MODE: '' }, false)).toBe(false);
  });

  it('shows it to a browser with the preview cookie while it is off for everyone else', async () => {
    const env = { CHECKOUT_MODE: 'off', MAINTENANCE_BYPASS_TOKEN: TOKEN };
    const cookie = await previewCookie();
    expect(await checkoutOpen(new Request(`${site}/program`, { headers: { cookie } }), env, true)).toBe(true);
    expect(await checkoutOpen(new Request(`${site}/program`, { headers: { cookie: 'tvt_preview=forged' } }), env, true)).toBe(false);
    // Without a bypass token configured, no cookie opens it.
    expect(await checkoutOpen(new Request(`${site}/program`, { headers: { cookie } }), { CHECKOUT_MODE: 'off' }, true)).toBe(false);
  });
});

describe('the Worker header', () => {
  it('is read back by the pages, with the build setting when it is missing', () => {
    expect(checkoutFromHeader(new Headers({ [CHECKOUT_HEADER]: 'on' }), false)).toBe(true);
    expect(checkoutFromHeader(new Headers({ [CHECKOUT_HEADER]: 'off' }), true)).toBe(false);
    expect(checkoutFromHeader(new Headers(), true)).toBe(true);
    expect(checkoutFromHeader(new Headers({ [CHECKOUT_HEADER]: 'nonsense' }), false)).toBe(false);
  });
});

describe('program page FAQs', () => {
  it('explain the basket while checkout is on and the contact form while it is off', () => {
    expect(programFaqs(true).map((faq) => faq.a).join(' ')).toContain('basket');
    expect(programFaqs(false)[0]!.q).toBe('How do I buy a program?');
    expect(programFaqs(false).map((faq) => faq.a).join(' ')).not.toContain('basket');
    expect(programFaqs(true)).toHaveLength(5);
  });
});
