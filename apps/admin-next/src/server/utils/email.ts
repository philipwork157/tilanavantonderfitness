import 'server-only';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { formatFromAddress, redirectOptions, routeEmail, type OutgoingEmail } from './email-routing';
import { serverConfig } from '../config';

let client: SESv2Client | undefined;

/**
 * Send through Amazon SES. Region and credentials come from the standard
 * AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables.
 * Returns the SES message id, used to match bounce and complaint reports.
 */
export async function sendEmail(email: OutgoingEmail): Promise<{ messageId: string | null }> {
  const config = serverConfig();
  if (!config.emailFromAddress) {
    throw new Error('EMAIL_FROM_ADDRESS is not set.');
  }

  // SITE_ENVIRONMENT, not NODE_ENV: the develop admin on Fly runs a
  // production build but must still only email the developer.
  const routed = routeEmail(email, redirectOptions(config.siteEnvironment, config.emailDevRedirectTo));

  client ??= new SESv2Client({});
  const result = await client.send(new SendEmailCommand({
    FromEmailAddress: formatFromAddress(config.emailFromAddress, routed.fromName ?? config.emailFromName),
    Destination: { ToAddresses: routed.to },
    ReplyToAddresses: routed.replyTo,
    Content: {
      Simple: {
        Subject: { Data: routed.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: routed.text, Charset: 'UTF-8' },
          ...(routed.html ? { Html: { Data: routed.html, Charset: 'UTF-8' } } : {}),
        },
        ...(routed.headers?.length ? { Headers: routed.headers.map(({ name, value }) => ({ Name: name, Value: value })) } : {}),
        ...(routed.attachments?.length
          ? {
              Attachments: routed.attachments.map(file => ({
                FileName: file.fileName,
                ContentType: file.contentType,
                ContentDisposition: 'ATTACHMENT' as const,
                ContentTransferEncoding: 'BASE64' as const,
                RawContent: file.data,
              })),
            }
          : {}),
      },
    },
  }));
  return { messageId: result.MessageId ?? null };
}
