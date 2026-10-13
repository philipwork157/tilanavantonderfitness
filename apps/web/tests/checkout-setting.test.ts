import { describe, expect, it } from 'vitest';
import { checkoutSetting } from '@web/site/config';

describe('online checkout switch (PUBLIC_CHECKOUT_ENABLED)', () => {
  it('follows the setting when it is given', () => {
    expect(checkoutSetting('true', 'production')).toBe(true);
    expect(checkoutSetting(' TRUE ', 'production')).toBe(true);
    expect(checkoutSetting('false', 'development')).toBe(false);
  });

  it('is on for development and off for the live website when not set', () => {
    expect(checkoutSetting(undefined, 'development')).toBe(true);
    expect(checkoutSetting('', 'development')).toBe(true);
    expect(checkoutSetting(undefined, 'production')).toBe(false);
    expect(checkoutSetting('', 'production')).toBe(false);
  });
});
