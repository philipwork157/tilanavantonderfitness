import { describe, expect, it } from 'vitest';
import { createCheckoutSelectionGuard, lockCheckoutSelection, sameBasketSelection } from '@web/scripts/checkout-selection';

describe('submitted checkout selection', () => {
  it('freezes the snapshot during a delayed response and ignores later edits', async () => {
    const guard = createCheckoutSelectionGuard();
    const reviewed = ['beginner-volume-1', 'strong-volume-1'];
    const stored = [...reviewed];
    const result = guard.begin(reviewed, stored);
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('Expected snapshot');
    reviewed.pop();
    stored.push('nourish-volume-1');
    await Promise.resolve();
    expect(result.slugs).toEqual(['beginner-volume-1', 'strong-volume-1']);
    expect(Object.isFrozen(result.slugs)).toBe(true);
    expect(guard.active).toBe(true);
    expect(guard.begin(reviewed, stored)).toEqual({ state: 'busy' });
    guard.finish();
    expect(guard.active).toBe(false);
  });
  it('rejects unseen cross-tab edits before submission and allows a reviewed retry', () => {
    const guard = createCheckoutSelectionGuard();
    expect(guard.begin(['beginner-volume-1'], ['strong-volume-1'])).toEqual({ state: 'changed' });
    expect(guard.active).toBe(false);
    expect(guard.begin(['strong-volume-1'], ['strong-volume-1']).state).toBe('ready');
    guard.finish();
    expect(guard.begin(['strong-volume-1'], ['strong-volume-1']).state).toBe('ready');
  });
  it('compares sets without mutating their order', () => {
    const left = ['strong-volume-1', 'beginner-volume-1'];
    expect(sameBasketSelection(left, [...left].reverse())).toBe(true);
    expect(left[0]).toBe('strong-volume-1');
    expect(sameBasketSelection(left, ['strong-volume-1'])).toBe(false);
  });
  it('locks and unlocks all mouse/keyboard edits using inert', () => {
    const attributes = new Set();
    const content = { toggleAttribute: (name: string, enabled: boolean) => enabled ? attributes.add(name) : attributes.delete(name) };
    lockCheckoutSelection(content as unknown as HTMLElement, true);
    expect(attributes.has('inert')).toBe(true);
    lockCheckoutSelection(content as unknown as HTMLElement, false);
    expect(attributes.has('inert')).toBe(false);
    expect(() => lockCheckoutSelection(null, true)).not.toThrow();
  });
});
