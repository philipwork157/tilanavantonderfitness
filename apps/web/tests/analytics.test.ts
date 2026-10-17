import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { scrubEvent, scrubUrl } from '@web/utils/analytics';

describe('analytics privacy', () => {
  it('removes tokens, payment references and pre-filled messages from URLs', () => {
    expect(scrubUrl('https://tilana.co.za/newsletter/confirmed?token=abc123')).toBe('https://tilana.co.za/newsletter/confirmed');
    expect(scrubUrl('https://tilana.co.za/checkout/complete?reference=T123&trxref=T123')).toBe('https://tilana.co.za/checkout/complete');
    expect(scrubUrl('https://tilana.co.za/contact?interest=nourish&message=Hi%20there')).toBe('https://tilana.co.za/contact?interest=nourish');
    expect(scrubUrl('/newsletter/unsubscribe?token=abc#top')).toBe('/newsletter/unsubscribe#top');
  });

  it('leaves ordinary URLs and text alone', () => {
    expect(scrubUrl('https://tilana.co.za/program#peek')).toBe('https://tilana.co.za/program#peek');
    expect(scrubUrl('https://tilana.co.za/contact?interest=move')).toBe('https://tilana.co.za/contact?interest=move');
    expect(scrubUrl('$direct')).toBe('$direct');
  });

  it('cleans every URL property and labels the environment', () => {
    const event = {
      uuid: '1',
      event: '$pageview',
      properties: { $current_url: 'https://tilana.co.za/newsletter/confirmed?token=secret', $referrer: 'https://x.test/?email=a@b.c', other: '?token=kept-because-not-a-url-property' },
    } as CaptureResult;
    const result = scrubEvent(event, 'production');
    expect(result?.properties.$current_url).toBe('https://tilana.co.za/newsletter/confirmed');
    expect(result?.properties.$referrer).toBe('https://x.test/');
    expect(result?.properties.site_environment).toBe('production');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(scrubEvent(null, 'production')).toBeNull();
  });
});
