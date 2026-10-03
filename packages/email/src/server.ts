import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: EmailAddress;
  to: EmailAddress[];
  replyTo?: EmailAddress[];
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

/** Binary attachments stay server-side; the SES SDK performs wire encoding. */
export interface EmailAttachment {
  filename: string;
  contentType: 'application/pdf';
  content: Uint8Array;
}

export interface EmailSender {
  send(message: EmailMessage, options?: { abortSignal?: AbortSignal }): Promise<{ messageId?: string }>;
}

export interface SesEmailSenderOptions {
  region: string;
}

function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

/**
 * Creates a server-only SES sender. Credentials come from the standard AWS SDK
 * provider chain, so production can use an IAM role and local development can
 * use AWS environment variables or a configured AWS profile.
 */
export function createSesEmailSender(options: SesEmailSenderOptions): EmailSender {
  if (!options.region) throw new Error('An AWS SES region is required.');

  const client = new SESv2Client({ region: options.region });

  return {
    async send(message, options) {
      const response = await client.send(new SendEmailCommand({
        FromEmailAddress: formatAddress(message.from),
        Destination: {
          ToAddresses: message.to.map(formatAddress),
        },
        ReplyToAddresses: message.replyTo?.map(formatAddress),
        Content: {
          Simple: {
            Attachments: message.attachments?.map(attachment => ({
              FileName: attachment.filename,
              ContentType: attachment.contentType,
              RawContent: attachment.content,
              ContentDisposition: 'ATTACHMENT',
              ContentTransferEncoding: 'BASE64',
            })),
            Subject: {
              Charset: 'UTF-8',
              Data: message.subject,
            },
            Body: {
              Text: {
                Charset: 'UTF-8',
                Data: message.text,
              },
              Html: {
                Charset: 'UTF-8',
                Data: message.html,
              },
            },
          },
        },
      }), options);

      return { messageId: response.MessageId };
    },
  };
}
