import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
// Resolve SES from its owning workspace; admin does not depend on SES directly.
const require = createRequire(import.meta.url);
const emailRequire = createRequire(require.resolve('@tilana/email/server'));
vi.doMock(emailRequire.resolve('@aws-sdk/client-sesv2'), () => ({
  SESv2Client: class { send = mocks.send; },
  SendEmailCommand: class { constructor(public input: unknown) {} },
}));
const { createSesEmailSender } = await import('@tilana/email/server');
beforeEach(() => mocks.send.mockResolvedValue({ MessageId: 'fixture' }));
describe('SES attachment transport', () => {
  const message = { from: { email: 'sender@example.test' }, to: [{ email: 'safe@example.test' }], subject: 'Programs', text: 'Text', html: '<p>Text</p>' };
  it('passes PDF bytes to SES with explicit base64 MIME encoding and abort support', async () => {
    const content = Buffer.from('%PDF-fixture');
    const abortSignal = new AbortController().signal;
    await createSesEmailSender({ region: 'af-south-1' }).send({ ...message, attachments: [{ filename: 'Beginner.pdf', contentType: 'application/pdf', content }] }, { abortSignal });
    expect(mocks.send.mock.calls[0]?.[0].input.Content.Simple.Attachments).toEqual([{ FileName: 'Beginner.pdf', ContentType: 'application/pdf', RawContent: content, ContentDisposition: 'ATTACHMENT', ContentTransferEncoding: 'BASE64' }]);
    expect(mocks.send.mock.calls[0]?.[1]).toEqual({ abortSignal });
  });
  it('preserves link-only messages and provider errors', async () => {
    const sender = createSesEmailSender({ region: 'af-south-1' });
    expect(await sender.send(message)).toEqual({ messageId: 'fixture' });
    expect(mocks.send.mock.calls[0]?.[0].input.Content.Simple.Attachments).toBeUndefined();
    mocks.send.mockRejectedValueOnce(new Error('SES unavailable'));
    await expect(sender.send(message)).rejects.toThrow('SES unavailable');
  });
});
