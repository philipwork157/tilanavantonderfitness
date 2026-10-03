import { renderCustomerAccessEmail } from '@server/email-templates/customer-access';
import { getServerEmail } from '@server/utils/email';
import { getPaystackEnvironment } from '@server/utils/paystack-configuration';
import { getEmailRecipient } from '@server/utils/email-delivery';
import type { EmailAttachment } from '@tilana/email/server';

export async function sendCustomerAccessEmail(input: {
  intendedRecipient: string;
  firstName: string;
  signInUrl: string;
  instructionsOnly?: boolean;
  attachments?: EmailAttachment[];
  signal?: AbortSignal;
}) {
  const config = useRuntimeConfig();
  const redirectToDevelopment = getPaystackEnvironment(config) === 'test';
  const recipient = getEmailRecipient(input.intendedRecipient, { test: redirectToDevelopment, live: !redirectToDevelopment }, config);
  const { subject, text, html } = renderCustomerAccessEmail({
    firstName: input.firstName,
    signInUrl: input.signInUrl,
    intendedEmail: input.intendedRecipient,
    redirectedToDevelopment: redirectToDevelopment,
    instructionsOnly: input.instructionsOnly,
    hasAttachments: Boolean(input.attachments?.length),
  });
  const { sender, from } = getServerEmail();
  input.signal?.throwIfAborted();
  const result = await sender.send({
    from,
    to: [{ email: recipient }],
    subject,
    text,
    html,
    attachments: input.instructionsOnly ? input.attachments : undefined,
  }, { abortSignal: input.signal });

  return {
    messageId: result.messageId,
    redirectedToDevelopment: redirectToDevelopment,
  };
}
