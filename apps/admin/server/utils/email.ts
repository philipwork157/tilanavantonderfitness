import { getEmailRecipient, isDevelopmentEmailEnabled } from './email-delivery';
import { createSesEmailSender, type EmailAddress, type EmailSender } from '@tilana/email/server';
import { invoiceEmailSchema } from '@tilana/contracts/invoices';

let emailSender: EmailSender | undefined;
let emailSenderRegion: string | undefined;

/** Returns the shared server email transport and a verified sender identity. */
export function getServerEmail(senderOverride?: EmailAddress) {
  const config = useRuntimeConfig();
  const region = String(process.env.AWS_REGION || '').trim();
  const fromEmail = senderOverride?.email.trim() || String(config.emailFromAddress || '').trim();
  const fromName = senderOverride?.name?.trim() || String(config.emailFromName || '').trim();

  if (!region || !invoiceEmailSchema.safeParse(fromEmail).success) {
    throw new Error('Email delivery requires an AWS SES region and sender address.');
  }

  if (!emailSender || emailSenderRegion !== region) {
    emailSender = createSesEmailSender({ region });
    emailSenderRegion = region;
  }

  const from: EmailAddress = {
    email: fromEmail,
    ...(fromName && { name: fromName }),
  };

  // Apply the recipient guard at the shared transport so contact and operator
  // notifications cannot bypass development routing.
  const transport = emailSender;
  const sender: EmailSender = {
    checkConfiguration: () => transport.checkConfiguration(),
    send(message, options) {
      const recipient = getEmailRecipient(message.to[0]?.email || '', {}, config);
      return transport.send({ ...message, to: isDevelopmentEmailEnabled(config)
        ? [{ email: recipient }] : message.to }, options);
    },
  };
  return { sender, from };
}
