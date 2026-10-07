import { describe, expect, it } from 'vitest';
import { escapeHtml, formatFromAddress, routeEmail } from '@/server/utils/email-routing';
import { verifyTurnstileToken } from '@/server/utils/turnstile';
import { parseOrigins } from '@/server/utils/website-origins';
import { inquiryNotificationEmail } from '@/server/services/inquiries';

const email = { to: ['tilana@example.com'], subject: 'Hello', text: 'Body' };

describe('routeEmail', () => {
  it('sends normally when no redirect is set outside development', () => {
    expect(routeEmail(email, {})).toEqual(email);
  });

  it('redirects every email in development and shows the original recipient', () => {
    expect(routeEmail(email, { devRedirectTo: ' dev@example.com ', requireRedirect: true })).toMatchObject({
      to: ['dev@example.com'],
      subject: '[DEV to tilana@example.com] Hello',
    });
  });

  it('refuses to send in development without a redirect address', () => {
    expect(() => routeEmail(email, { requireRedirect: true })).toThrow(/EMAIL_DEV_REDIRECT_TO/);
  });
});

describe('formatting helpers', () => {
  it('builds a safe From header', () => {
    expect(formatFromAddress('hello@tilana.co.za', 'Tilana "van" Tonder\r\n<x>')).toBe('"Tilana van Tonder x" <hello@tilana.co.za>');
    expect(formatFromAddress('hello@tilana.co.za')).toBe('hello@tilana.co.za');
  });

  it('escapes HTML', () => {
    expect(escapeHtml('<script>"a" & \'b\'</script>')).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
  });
});

describe('parseOrigins', () => {
  it('keeps exact http(s) origins only', () => {
    expect(parseOrigins('http://localhost:4321, https://tilanavantonder.co.za/ ,javascript:alert(1), https://x.com/path'))
      .toEqual(['http://localhost:4321', 'https://tilanavantonder.co.za']);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe('verifyTurnstileToken', () => {
  const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it('accepts only a successful Cloudflare answer', async () => {
    expect(await verifyTurnstileToken('token', { secret: 's', fetcher: reply({ success: true }) })).toBe(true);
    expect(await verifyTurnstileToken('token', { secret: 's', fetcher: reply({ success: false }) })).toBe(false);
    expect(await verifyTurnstileToken('token', { secret: 's', fetcher: reply({}, false) })).toBe(false);
  });

  it('rejects an empty token and network failures without throwing', async () => {
    expect(await verifyTurnstileToken('', { secret: 's', fetcher: reply({ success: true }) })).toBe(false);
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await verifyTurnstileToken('token', { secret: 's', fetcher: failing })).toBe(false);
  });

  it('sends the secret, token and visitor IP', async () => {
    let sent: URLSearchParams | undefined;
    const capture = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return { ok: true, json: async () => ({ success: true }) };
    }) as unknown as typeof fetch;
    await verifyTurnstileToken('tok', { secret: 'sec', remoteIp: '1.2.3.4', fetcher: capture });
    expect(Object.fromEntries(sent!)).toEqual({ secret: 'sec', response: 'tok', remoteip: '1.2.3.4' });
  });
});

describe('inquiryNotificationEmail', () => {
  const inquiry = {
    id: 1,
    name: 'Anna <b>',
    email: 'anna@example.com',
    interestLabel: 'Beginner · Volume 1',
    message: 'Hi\n<script>x</script>',
    privacyAcceptedAt: new Date('2026-10-05T12:00:00Z'),
  };

  it('goes to Tilana with the visitor as reply-to', () => {
    const message = inquiryNotificationEmail(inquiry, 'tilana@example.com');
    expect(message.to).toEqual(['tilana@example.com']);
    expect(message.replyTo).toEqual(['anna@example.com']);
    expect(message.subject).toBe('New enquiry from Anna <b> · Beginner · Volume 1');
    expect(message.text).toContain('Privacy policy accepted: 05 Oct 2026, 14:00 (SAST)');
  });

  it('escapes visitor text in the HTML version', () => {
    const html = inquiryNotificationEmail(inquiry, 'tilana@example.com').html!;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Anna &lt;b&gt;');
  });
});
