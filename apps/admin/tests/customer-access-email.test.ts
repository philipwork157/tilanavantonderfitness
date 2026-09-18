import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCustomerAccessEmail } from '@server/services/customer-access-emails';
import { renderCustomerAccessEmail } from '@server/email-templates/customer-access';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@server/utils/email', () => ({ getServerEmail: () => ({ sender: mocks, from: { email: 'sender@example.test' } }) }));
beforeEach(() => mocks.send.mockResolvedValue({ messageId: 'fixture' }));
describe('customer access email safety and instructions', () => {
  const input = { firstName: '<Buyer>', intendedRecipient: 'buyer@example.test', signInUrl: 'https://admin.example.test/account/sign-in', instructionsOnly: true };
  it('uses only the intended recipient in live mode even with a test redirect configured', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', customerAccessDevelopmentRecipient: 'safe@example.test' }));
    await sendCustomerAccessEmail(input);
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: input.intendedRecipient }]);
  });
  it('requires a valid safe test inbox before transport', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test' }));
    await expect(sendCustomerAccessEmail(input)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('renders escaped purchase instructions and normal one-time-link text separately', () => {
    const purchase = renderCustomerAccessEmail({ ...input, intendedEmail: input.intendedRecipient, redirectedToDevelopment: false });
    expect(purchase.text).toContain('Your payment is confirmed.');
    expect(purchase.html).toContain('&lt;Buyer&gt;');
    const login = renderCustomerAccessEmail({ ...input, instructionsOnly: false, intendedEmail: input.intendedRecipient, redirectedToDevelopment: false });
    expect(login.text).toContain('Use this secure, one-time link');
    expect(login.text).not.toContain('Your payment is confirmed.');
  });
});
