import { getServerEmail } from '../utils/email';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendNewsletterConfirmation(email: string, token: string) {
  const config = useRuntimeConfig();
  const fromEmail = String(config.newsletterFromEmail || '').trim();
  const developmentRecipient = String(config.newsletterDevelopmentRecipient || '').trim();
  const apiBaseUrl = String(config.newsletterApiBaseUrl || '').trim().replace(/\/$/, '');
  if (!fromEmail || !apiBaseUrl) {
    throw new Error('Newsletter email requires a sender and API base URL.');
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment && !developmentRecipient) {
    throw new Error('Development newsletter delivery requires a safe recipient.');
  }

  const recipient = isDevelopment ? developmentRecipient : email;
  const developmentNotice = isDevelopment
    ? `Development preview — intended subscriber: ${email}`
    : '';

  const confirmUrl = `${apiBaseUrl}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const subject = `${isDevelopment ? '[DEV] ' : ''}Confirm your Tilana newsletter subscription`;
  const text = [
    ...(developmentNotice ? [developmentNotice, ''] : []),
    'Confirm your subscription',
    '',
    'Please confirm that you would like to receive occasional emails from Tilana van Tonder:',
    confirmUrl,
    '',
    'This link expires in 48 hours. If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6e4d9;color:#0f0e13;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #d5a27f;border-radius:24px;background:#fff">${developmentNotice ? `<tr><td style="padding:12px 24px;background:#0f0e13;color:#fffaf7;font-size:12px;text-align:center">${escapeHtml(developmentNotice)}</td></tr>` : ''}<tr><td style="padding:32px;background:#c9d2b3"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">One last step</p><h1 style="margin:0;font-family:Georgia,serif;font-size:34px">Confirm your subscription</h1></td></tr><tr><td style="padding:32px"><p style="margin:0 0 24px;line-height:1.7">Please confirm that you would like to receive occasional training guidance, programme updates, and practical healthy habits from Tilana.</p><p style="margin:0 0 24px"><a href="${confirmUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#d5a27f;color:#0f0e13;font-weight:700;text-decoration:none">Confirm my subscription</a></p><p style="margin:0;color:#614635;font-size:12px;line-height:1.6">This link expires in 48 hours. If you did not request this, simply ignore this email.</p></td></tr></table></td></tr></table></body></html>`;

  const { sender, from } = getServerEmail({ email: fromEmail, name: 'Tilana van Tonder' });
  return sender.send({
    from,
    to: [{ email: recipient }],
    subject,
    text,
    html,
  });
}
