import { renderCustomerAccessEmail } from '@server/email-templates/customer-access';
import { getServerEmail } from '@server/utils/email';
import { getPaystackEnvironment } from '@server/utils/paystack-configuration';
import { getEmailRecipient } from '@server/utils/email-delivery';

export async function sendCustomerAccessEmail(input: {
  intendedRecipient: string;
  firstName: string;
  signInUrl: string;
  instructionsOnly?: boolean;
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
  });
  const { sender, from } = getServerEmail();
  const result = await sender.send({
    from,
    to: [{ email: recipient }],
    subject,
    text,
    html,
  });

  return {
    messageId: result.messageId,
    redirectedToDevelopment: redirectToDevelopment,
  };
}
