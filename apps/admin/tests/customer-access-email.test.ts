import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCustomerAccessEmail } from '@server/services/customer-access-emails';
import { renderCustomerAccessEmail } from '@server/email-templates/customer-access';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@server/utils/email', () => ({ getServerEmail: () => ({ sender: mocks, from: { email: 'sender@example.test' } }) }));
beforeEach(() => mocks.send.mockResolvedValue({ messageId: 'fixture' }));
describe('customer access email safety and instructions', () => {
  const input = { firstName: '<Buyer>', intendedRecipient: 'buyer@example.test', signInUrl: 'https://admin.example.test/account/sign-in', instructionsOnly: true };
  it('uses only the intended recipient in live mode even with a test redirect configured', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', emailDevelopmentEnabled: false, emailDevelopmentRecipient: 'safe@example.test' }));
    await sendCustomerAccessEmail(input);
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: input.intendedRecipient }]);
  });
  it('routes test customer access through the shared inbox', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' }));
    await sendCustomerAccessEmail(input);
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: 'safe@example.test' }]);
  });
  it('blocks live access delivery when development routing is enabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' }));
    await expect(sendCustomerAccessEmail(input)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
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
  it('attaches purchased PDFs and thanks the buyer while preserving recovery instructions', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' }));
    const attachments = [{ filename: 'Beginner.pdf', contentType: 'application/pdf' as const, content: Buffer.from('%PDF-fixture') }];
    await sendCustomerAccessEmail({ ...input, attachments });
    const message = mocks.send.mock.calls[0]![0];
    expect(message.attachments).toEqual(attachments);
    expect(message.subject).toContain('Thank you for your purchase');
    expect(message.text).toContain('PDFs attached');
    expect(message.text).toContain('If you lose your files');
    expect(message.text).not.toContain('too large');
  });
  it('explains oversized baskets honestly without claiming attachments', () => {
    const message = renderCustomerAccessEmail({ ...input, intendedEmail: input.intendedRecipient, redirectedToDevelopment: false, hasAttachments: false });
    expect(message.text).toContain('too large to attach');
    expect(message.text).not.toContain('PDFs attached');
  });
  it('keeps login emails link-only', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', emailDevelopmentEnabled: false }));
    await sendCustomerAccessEmail({ ...input, instructionsOnly: false, attachments: [{ filename: 'ignored.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-fixture') }] });
    expect(mocks.send.mock.calls[0]![0].attachments).toBeUndefined();
    expect(mocks.send.mock.calls[0]![0].subject).toBe('Your Tilana program access link');
  });
  it('does not initiate SES after a delivery timeout', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', emailDevelopmentEnabled: false }));
    await expect(sendCustomerAccessEmail({ ...input, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
