import type { ContactFormRequest } from '@tilana/contracts/contact';
import { renderContactNotificationEmail } from '../email-templates/contact-notification';
import { getServerEmail } from '../utils/email';

type ContactNotificationInput = Pick<
  ContactFormRequest,
  'name' | 'email' | 'interest' | 'message'
> & {
  submissionId: string;
  submittedAt: Date;
};

function isEnabled(value: boolean | string): boolean {
  return value === true || value === 'true';
}

/** Sends Tilana a server-side notification after an enquiry is persisted. */
export async function sendContactSubmissionNotification(input: ContactNotificationInput) {
  const config = useRuntimeConfig();
  if (!isEnabled(config.contactNotificationEnabled)) return { sent: false as const };

  const toEmail = String(config.contactNotificationTo || '').trim();

  if (!toEmail) {
    throw new Error('Contact email notifications require a recipient.');
  }

  const { subject, text, html } = renderContactNotificationEmail(input);

  const { sender, from } = getServerEmail();
  const result = await sender.send({
    from,
    to: [{ email: toEmail, name: 'Tilana van Tonder' }],
    replyTo: [{ email: input.email }],
    subject,
    text,
    html,
  });

  return { sent: true as const, messageId: result.messageId };
}
