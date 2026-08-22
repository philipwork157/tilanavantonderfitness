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
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ messageId?: string }>;
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
    async send(message) {
      const response = await client.send(new SendEmailCommand({
        FromEmailAddress: formatAddress(message.from),
        Destination: {
          ToAddresses: message.to.map(formatAddress),
        },
        ReplyToAddresses: message.replyTo?.map(formatAddress),
        Content: {
          Simple: {
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
      }));

      return { messageId: response.MessageId };
    },
  };
}
