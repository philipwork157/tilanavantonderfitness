import { renderCustomerAccessEmail } from '../email-templates/customer-access';
import { getServerEmail } from '../utils/email';

function isCustomerAccessDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
    || process.env.FLY_APP_NAME === 'tilanavantonder-admin-dev';
}

export async function sendCustomerAccessEmail(input: {
  intendedRecipient: string;
  firstName: string;
  signInUrl: string;
}) {
  const config = useRuntimeConfig();
  const developmentRecipient = String(config.customerAccessDevelopmentRecipient || '').trim();
  const redirectToDevelopment = isCustomerAccessDevelopmentEnvironment() && Boolean(developmentRecipient);
  const recipient = redirectToDevelopment ? developmentRecipient : input.intendedRecipient;
  const { subject, text, html } = renderCustomerAccessEmail({
    firstName: input.firstName,
    signInUrl: input.signInUrl,
    intendedEmail: input.intendedRecipient,
    redirectedToDevelopment: redirectToDevelopment,
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
