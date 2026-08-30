import { getServerEmail } from '../utils/email';
import type { NewsletterCampaignInput } from '@tilana/contracts/newsletter';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Fly dev builds still use NODE_ENV=production, so the Fly app identity is part of the safety check. */
export function isNewsletterDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
    || process.env.FLY_APP_NAME === 'tilanavantonder-admin-dev';
}

function getNewsletterRecipient(intendedRecipient: string, forceDevelopmentRecipient = false) {
  const config = useRuntimeConfig();
  const developmentRecipient = String(config.newsletterDevelopmentRecipient || '').trim();
  const redirectToDevelopment = forceDevelopmentRecipient || isNewsletterDevelopmentEnvironment();
  if (redirectToDevelopment && !developmentRecipient) {
    throw new Error('Development newsletter delivery requires NUXT_NEWSLETTER_DEVELOPMENT_RECIPIENT.');
  }
  return {
    recipient: redirectToDevelopment ? developmentRecipient : intendedRecipient,
    redirected: redirectToDevelopment,
  };
}

export async function sendNewsletterConfirmation(email: string, token: string) {
  const config = useRuntimeConfig();
  const fromEmail = String(config.newsletterFromEmail || '').trim();
  const apiBaseUrl = String(config.newsletterApiBaseUrl || '').trim().replace(/\/$/, '');
  if (!fromEmail || !apiBaseUrl) {
    throw new Error('Newsletter email requires a sender and API base URL.');
  }

  const delivery = getNewsletterRecipient(email);
  const developmentNotice = delivery.redirected
    ? `Development preview — intended subscriber: ${email}`
    : '';

  const confirmUrl = `${apiBaseUrl}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const subject = `${delivery.redirected ? '[DEV] ' : ''}Confirm your Tilana newsletter subscription`;
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
    to: [{ email: delivery.recipient }],
    subject,
    text,
    html,
  });
}

export async function sendNewsletterCampaignEmail(options: {
  campaign: NewsletterCampaignInput;
  recipient: string;
  unsubscribeUrl: string;
  test?: boolean;
}) {
  const config = useRuntimeConfig();
  const fromEmail = String(config.newsletterFromEmail || '').trim();
  if (!fromEmail) throw new Error('Newsletter email requires a verified sender address.');

  const { campaign, recipient: intendedRecipient, unsubscribeUrl, test = false } = options;
  const delivery = getNewsletterRecipient(intendedRecipient, test);
  const subject = `${delivery.redirected ? '[TEST] ' : ''}${campaign.subject}`;
  const safe = {
    subject: escapeHtml(campaign.subject),
    previewText: escapeHtml(campaign.previewText),
    blogTitle: escapeHtml(campaign.blogTitle),
    introduction: escapeHtml(campaign.introduction).replaceAll('\n', '<br>'),
    blogUrl: escapeHtml(campaign.blogUrl),
    unsubscribeUrl: escapeHtml(unsubscribeUrl),
  };
  const text = [
    campaign.blogTitle,
    '',
    campaign.introduction,
    '',
    `Read the blog: ${campaign.blogUrl}`,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>${safe.subject}</title></head><body style="margin:0;background:#f6e4d9;color:#0f0e13;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${safe.previewText}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6e4d9"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border:1px solid #d5a27f;border-radius:28px;background:#fffaf7"><tr><td style="padding:38px 36px;background:#c9d2b3"><p style="margin:0 0 10px;color:#795744;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">A thoughtful note from Tilana</p><h1 style="margin:0;font-family:Georgia,serif;font-size:38px;line-height:1.12">${safe.blogTitle}</h1></td></tr><tr><td style="padding:38px 36px"><p style="margin:0 0 26px;color:#614635;font-size:17px;line-height:1.75">${safe.introduction}</p><p style="margin:0 0 30px"><a href="${safe.blogUrl}" style="display:inline-block;padding:15px 25px;border-radius:999px;background:#d5a27f;color:#0f0e13;font-weight:700;text-decoration:none">Read the blog&nbsp; →</a></p><p style="margin:0;padding-top:22px;border-top:1px solid #ead3c5;color:#795744;font-size:12px;line-height:1.7">You are receiving this because you confirmed your subscription to Tilana van Tonder’s newsletter. <a href="${safe.unsubscribeUrl}" style="color:#795744;text-decoration:underline">Unsubscribe</a>.</p></td></tr></table></td></tr></table></body></html>`;

  const { sender, from } = getServerEmail({ email: fromEmail, name: 'Tilana van Tonder' });
  return sender.send({ from, to: [{ email: delivery.recipient }], subject, text, html });
}
