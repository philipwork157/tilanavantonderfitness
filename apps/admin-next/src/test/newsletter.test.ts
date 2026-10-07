import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { campaignEmail, confirmationEmail, type CampaignEmailContent } from '@/server/services/newsletter-emails';
import { classifySendError } from '@/server/services/newsletter-sending';
import { isAmazonSnsUrl, parseSnsMessage, snsStringToSign, verifySnsSignature, type SnsMessage } from '@/server/services/ses-events';

const content: CampaignEmailContent = {
  subject: 'Protein <b>matters</b>',
  previewText: 'Why protein helps',
  introduction: 'Hi friend,\n\nThis one is <script>alert(1)</script> close to my heart.',
  websiteUrl: 'https://tilanavantonder.co.za',
  unsubscribeUrl: 'https://tilanavantonder.co.za/newsletter/unsubscribe?token=abc',
  post: {
    title: 'Protein: "My" Favourite',
    excerpt: 'A practical look at protein.',
    category: 'Nourishment',
    url: 'https://tilanavantonder.co.za/blog/protein',
    imageUrl: 'https://example.supabase.co/storage/v1/object/public/blog-images/email/posts/1/a.jpg',
    imageAlt: 'A bowl of food',
  },
};

describe('newsletter emails', () => {
  it('escapes everything typed in the admin', () => {
    const email = campaignEmail('anna@example.com', content);
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Protein: &quot;My&quot; Favourite');
    expect(email.html).toContain('<title>Protein &lt;b&gt;matters&lt;/b&gt;</title>');
  });

  it('links to the post and includes a personal unsubscribe link and header', () => {
    const email = campaignEmail('anna@example.com', content);
    expect(email.to).toEqual(['anna@example.com']);
    expect(email.fromName).toBe('Tilana van Tonder');
    expect(email.html).toContain('href="https://tilanavantonder.co.za/blog/protein"');
    expect(email.html).toContain('href="https://tilanavantonder.co.za/newsletter/unsubscribe?token=abc"');
    expect(email.headers).toEqual([{ name: 'List-Unsubscribe', value: '<https://tilanavantonder.co.za/newsletter/unsubscribe?token=abc>' }]);
    expect(email.text).toContain('Read the full post: https://tilanavantonder.co.za/blog/protein');
    expect(email.text).toContain('Hi friend,');
  });

  it('marks test emails and leaves out the unsubscribe link', () => {
    const email = campaignEmail('tilana@example.com', { ...content, unsubscribeUrl: null }, { test: true });
    expect(email.subject).toBe('[Test] Protein <b>matters</b>');
    expect(email.headers).toEqual([]);
    expect(email.html).toContain('Test email:');
  });

  it('builds the confirmation email with the website link', () => {
    const email = confirmationEmail('anna@example.com', 'https://tilanavantonder.co.za/newsletter/confirmed?token=xyz', 'https://tilanavantonder.co.za');
    expect(email.subject).toBe('Please confirm your subscription');
    expect(email.html).toContain('href="https://tilanavantonder.co.za/newsletter/confirmed?token=xyz"');
    expect(email.text).toContain('expires in 48 hours');
  });
});

describe('sending errors', () => {
  it('retries rate limits and network problems, pauses on account problems', () => {
    expect(classifySendError(Object.assign(new Error('slow down'), { name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } }))).toBe('retry');
    expect(classifySendError(new Error('socket hang up'))).toBe('retry');
    expect(classifySendError(Object.assign(new Error('Email address is not verified'), { name: 'MessageRejected', $metadata: { httpStatusCode: 400 } }))).toBe('pause');
    expect(classifySendError(Object.assign(new Error('Daily quota'), { name: 'LimitExceededException', $metadata: { httpStatusCode: 400 } }))).toBe('pause');
  });
});

describe('Amazon SNS messages', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  function signed(fields: Partial<SnsMessage> = {}, version = '1'): SnsMessage {
    const message = {
      Type: 'Notification',
      MessageId: 'm-1',
      TopicArn: 'arn:aws:sns:af-south-1:123:ses-events',
      Message: JSON.stringify({ notificationType: 'Bounce' }),
      Timestamp: '2026-10-06T10:00:00.000Z',
      SignatureVersion: version,
      Signature: '',
      SigningCertURL: 'https://sns.af-south-1.amazonaws.com/SimpleNotificationService-abc.pem',
      ...fields,
    } as SnsMessage;
    message.Signature = createSign(version === '1' ? 'RSA-SHA1' : 'RSA-SHA256').update(snsStringToSign(message)).sign(privateKey, 'base64');
    return message;
  }

  it('accepts a correctly signed message (both signature versions)', async () => {
    expect(await verifySnsSignature(signed(), async () => certificate)).toBe(true);
    expect(await verifySnsSignature(signed({}, '2'), async () => certificate)).toBe(true);
  });

  it('rejects changed content, foreign certificate hosts and unknown versions', async () => {
    const tampered = { ...signed(), Message: JSON.stringify({ notificationType: 'Complaint' }) };
    expect(await verifySnsSignature(tampered, async () => certificate)).toBe(false);
    const foreign = signed({ SigningCertURL: 'https://evil.example.com/cert.pem' });
    expect(await verifySnsSignature(foreign, async () => certificate)).toBe(false);
    expect(await verifySnsSignature({ ...signed(), SignatureVersion: '3' }, async () => certificate)).toBe(false);
  });

  it('only trusts Amazon SNS addresses', () => {
    expect(isAmazonSnsUrl('https://sns.af-south-1.amazonaws.com/x.pem', 'certificate')).toBe(true);
    expect(isAmazonSnsUrl('https://sns.af-south-1.amazonaws.com.evil.com/x.pem', 'certificate')).toBe(false);
    expect(isAmazonSnsUrl('http://sns.af-south-1.amazonaws.com/x.pem', 'certificate')).toBe(false);
    expect(isAmazonSnsUrl('https://sns.af-south-1.amazonaws.com/?Action=ConfirmSubscription&Token=1', 'subscribe')).toBe(true);
    expect(isAmazonSnsUrl('https://sns.af-south-1.amazonaws.com/?Action=Publish', 'subscribe')).toBe(false);
  });

  it('ignores anything that is not an SNS message', () => {
    expect(parseSnsMessage({ hello: 'world' })).toBeNull();
    expect(parseSnsMessage(null)).toBeNull();
  });
});
