import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEmailRecipient } from '@server/utils/email-delivery';
import { getServerEmail } from '@server/utils/email';
import { sendContactSubmissionNotification } from '@server/services/contact-notifications';
import { sendNewsletterConfirmation, sendNewsletterCampaignEmail } from '@server/services/newsletter-emails';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@tilana/email/server', () => ({ createSesEmailSender: () => mocks }));
const config = {
  emailDevelopmentEnabled: true as boolean | string, emailDevelopmentRecipient: 'safe@example.test',
  emailFromAddress: 'sender@example.test', emailFromName: 'Tilana', contactNotificationEnabled: true,
  contactNotificationTo: 'owner@example.test', newsletterFromEmail: 'newsletter@example.test',
  accountBaseUrl: 'https://admin.example.test', public: { siteUrl: 'https://website.example.test' },
};
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => config);
  vi.stubEnv('AWS_REGION', 'eu-west-1');
  mocks.send.mockResolvedValue({ messageId: 'fixture' });
});
describe('shared email routing', () => {
  it.each([true, 'true'])('redirects all transport recipients with enabled=%s', async enabled => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, emailDevelopmentEnabled: enabled }));
    await getServerEmail().sender.send({ from: { email: config.emailFromAddress }, to: [{ email: 'operator@example.test' }, { email: 'other@example.test' }], subject: 'Alert', text: 'Text', html: '<p>Text</p>' });
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: config.emailDevelopmentRecipient }]);
  });
  it('preserves normal recipients when disabled', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, emailDevelopmentEnabled: 'false' }));
    expect(getEmailRecipient('buyer@example.test')).toBe('buyer@example.test');
  });
  it.each(['', 'invalid'])('blocks an invalid enabled inbox %s before SES', async inbox => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, emailDevelopmentRecipient: inbox }));
    await expect(async () => getServerEmail().sender.send({ from: { email: config.emailFromAddress }, to: [{ email: 'buyer@example.test' }], subject: 'Email', text: '', html: '' })).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('requires the switch in test mode and rejects it for live customer delivery', () => {
    expect(() => getEmailRecipient('buyer@example.test', { test: true }, { ...config, emailDevelopmentEnabled: false })).toThrow();
    expect(() => getEmailRecipient('buyer@example.test', { live: true })).toThrow();
  });
  it('routes contact notifications through the shared inbox', async () => {
    await sendContactSubmissionNotification({ name: 'Buyer', email: 'buyer@example.test', interest: 'general', message: 'Hello', submissionId: 1, submittedAt: new Date() });
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: config.emailDevelopmentRecipient }]);
  });
  it('derives newsletter confirmation links from the backend origin', async () => {
    await sendNewsletterConfirmation('subscriber@example.test', 'fixture-token');
    expect(mocks.send.mock.calls[0]![0].text).toContain('https://admin.example.test/api/newsletter/confirm?token=fixture-token');
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: config.emailDevelopmentRecipient }]);
  });
  it('keeps explicit newsletter previews in the same inbox with global redirection disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, emailDevelopmentEnabled: false }));
    await sendNewsletterCampaignEmail({ campaign: { subject: 'Preview', previewText: '', blogTitle: 'Blog', introduction: 'Hello', blogUrl: 'https://website.example.test/blog/post' }, recipient: 'subscriber@example.test', unsubscribeUrl: 'https://website.example.test/privacy', test: true });
    expect(mocks.send.mock.calls[0]![0].to).toEqual([{ email: config.emailDevelopmentRecipient }]);
  });
});
