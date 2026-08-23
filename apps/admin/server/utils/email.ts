import { createSesEmailSender, type EmailAddress, type EmailSender } from '@tilana/email/server';

let emailSender: EmailSender | undefined;
let emailSenderRegion: string | undefined;

/** Returns the shared server email transport and a verified sender identity. */
export function getServerEmail(senderOverride?: EmailAddress) {
  const config = useRuntimeConfig();
  const region = String(process.env.AWS_REGION || '').trim();
  const fromEmail = senderOverride?.email.trim() || String(config.emailFromAddress || '').trim();
  const fromName = senderOverride?.name?.trim() || String(config.emailFromName || '').trim();

  if (!region || !fromEmail) {
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

  return { sender: emailSender, from };
}
