import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { formatFromAddress, routeEmail, type OutgoingEmail } from './email-routing';

let client: SESv2Client | undefined;

/**
 * Send through Amazon SES. Region and credentials come from the standard
 * AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const config = useRuntimeConfig();
  if (!config.emailFromAddress) {
    throw new Error('NUXT_EMAIL_FROM_ADDRESS is not set.');
  }

  const routed = routeEmail(email, {
    devRedirectTo: config.emailDevRedirectTo,
    requireRedirect: import.meta.dev,
  });

  client ??= new SESv2Client({});
  await client.send(new SendEmailCommand({
    FromEmailAddress: formatFromAddress(config.emailFromAddress, config.emailFromName),
    Destination: { ToAddresses: routed.to },
    ReplyToAddresses: routed.replyTo,
    Content: {
      Simple: {
        Subject: { Data: routed.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: routed.text, Charset: 'UTF-8' },
          ...(routed.html ? { Html: { Data: routed.html, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  }));
}
