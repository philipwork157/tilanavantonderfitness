import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { assertBillingTextSupported } from '@server/utils/billing-font';

describe('billing authoring font validation', () => {
  it('accepts Afrikaans accents and rejects unsupported glyphs before issuance', async () => {
    vi.stubGlobal('useStorage', () => ({ getItemRaw: () => readFile(new URL('../server/assets/fonts/NotoSans-Regular.ttf', import.meta.url)) }));
    vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Billing validation'), input));
    await expect(assertBillingTextSupported(['Zoë', 'Afrikaans naïef', null])).resolves.toBeUndefined();
    await expect(assertBillingTextSupported(['Buyer 😀'])).rejects.toMatchObject({ statusCode: 400 });
  });
  it('fails closed when the bundled font is unavailable', async () => {
    vi.stubGlobal('useStorage', () => ({ getItemRaw: async () => null }));
    vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Unavailable'), input));
    await expect(assertBillingTextSupported(['Buyer'])).rejects.toMatchObject({ statusCode: 503 });
  });
});
