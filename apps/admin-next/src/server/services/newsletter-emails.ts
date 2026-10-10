import 'server-only';
/**
 * Newsletter emails. Pure functions (no framework or AWS) so they can be previewed
 * and unit tested. Every value from the database is HTML-escaped; layout uses
 * tables and inline styles because email apps ignore most CSS.
 */
import { escapeHtml, type OutgoingEmail } from '../utils/email-routing';
import { button, colors, FROM_NAME, fonts, layout, paragraphs, siteLabel } from './email-layout';

export interface CampaignEmailContent {
  subject: string;
  previewText: string;
  introduction: string;
  post: {
    title: string;
    excerpt: string;
    category: string;
    url: string;
    imageUrl: string | null;
    imageAlt: string | null;
  };
  websiteUrl: string;
  /** Personal unsubscribe link; null for test emails. */
  unsubscribeUrl: string | null;
}

export function campaignEmailHtml(content: CampaignEmailContent): string {
  const { post } = content;
  const text = `margin:0 0 18px;font-family:${fonts.body};font-size:16px;line-height:1.7;color:${colors.chocolate}`;
  const image = post.imageUrl
    ? `<tr><td style="padding:24px 24px 0"><a href="${escapeHtml(post.url)}"><img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.imageAlt ?? post.title)}" width="550" style="display:block;width:100%;max-width:550px;height:auto;border:0;border-radius:16px"></a></td></tr>`
    : '';
  const introduction = content.introduction.trim()
    ? paragraphs(content.introduction, text)
    : '';
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${image}
<tr><td style="padding:28px 32px 8px">
<p style="margin:0 0 10px;font-family:${fonts.body};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${colors.caramel}">New on the blog · ${escapeHtml(post.category)}</p>
<h1 style="margin:0 0 20px;font-family:${fonts.heading};font-size:32px;font-weight:400;line-height:1.2;color:${colors.ink}">${escapeHtml(post.title)}</h1>
${introduction}
<p style="${text}">${escapeHtml(post.excerpt)}</p>
</td></tr>
<tr><td style="padding:4px 32px 32px">${button(post.url, 'Read the full post →')}</td></tr>
<tr><td style="padding:24px 32px 32px;background:${colors.sage};font-family:${fonts.body};font-size:15px;color:${colors.chocolate}">With love,<br><span style="font-family:${fonts.heading};font-size:24px;font-style:italic;color:${colors.ink}">Tilana</span></td></tr>
</table>`;

  const unsubscribe = content.unsubscribeUrl
    ? `<a href="${escapeHtml(content.unsubscribeUrl)}" style="color:${colors.caramel};text-decoration:underline">Unsubscribe</a>`
    : '<strong>Test email:</strong> subscribers get their personal unsubscribe link here';
  const footer = `You are receiving this because you subscribed on <a href="${escapeHtml(content.websiteUrl)}" style="color:${colors.caramel};text-decoration:underline">${escapeHtml(siteLabel(content.websiteUrl))}</a>.<br>${unsubscribe}`;

  return layout({ title: content.subject, preheader: content.previewText || post.excerpt, body, footer });
}

export function campaignEmailText(content: CampaignEmailContent): string {
  return [
    `New on the blog: ${content.post.title}`,
    '',
    ...(content.introduction.trim() ? [content.introduction.trim(), ''] : []),
    content.post.excerpt,
    '',
    `Read the full post: ${content.post.url}`,
    '',
    'With love,',
    'Tilana',
    '',
    '---',
    content.unsubscribeUrl
      ? `Unsubscribe: ${content.unsubscribeUrl}`
      : 'Test email: subscribers get their personal unsubscribe link here.',
  ].join('\n');
}

/** One newsletter email. Test emails are marked in the subject. */
export function campaignEmail(to: string, content: CampaignEmailContent, options: { test?: boolean } = {}): OutgoingEmail {
  return {
    to: [to],
    fromName: FROM_NAME,
    subject: options.test ? `[Test] ${content.subject}` : content.subject,
    text: campaignEmailText(content),
    html: campaignEmailHtml(content),
    headers: content.unsubscribeUrl
      ? [{ name: 'List-Unsubscribe', value: `<${content.unsubscribeUrl}>` }]
      : [],
  };
}

/** Double opt-in: the link opens the website, which confirms the subscription. */
export function confirmationEmail(to: string, confirmUrl: string, websiteUrl: string): OutgoingEmail {
  const text = `margin:0 0 20px;font-family:${fonts.body};font-size:16px;line-height:1.7;color:${colors.chocolate}`;
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:32px 32px 8px">
<p style="margin:0 0 10px;font-family:${fonts.body};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${colors.caramel}">One last step</p>
<h1 style="margin:0 0 20px;font-family:${fonts.heading};font-size:30px;font-weight:400;line-height:1.2;color:${colors.ink}">Confirm your subscription</h1>
<p style="${text}">Please confirm that you would like to receive occasional emails from Tilana with new blog posts, training guidance and programme updates.</p>
</td></tr>
<tr><td style="padding:0 32px 28px">${button(confirmUrl, 'Yes, subscribe me')}</td></tr>
<tr><td style="padding:0 32px 32px;font-family:${fonts.body};font-size:13px;line-height:1.6;color:${colors.caramel}">This link expires in 48 hours. If you did not sign up, simply ignore this email and you will not hear from us.</td></tr>
</table>`;
  return {
    to: [to],
    fromName: FROM_NAME,
    subject: 'Please confirm your subscription',
    text: [
      'Confirm your subscription',
      '',
      'Please confirm that you would like to receive occasional emails from Tilana:',
      confirmUrl,
      '',
      'This link expires in 48 hours. If you did not sign up, simply ignore this email.',
    ].join('\n'),
    html: layout({
      title: 'Confirm your subscription',
      preheader: 'Tap the button to start receiving Tilana’s newsletter.',
      body,
      footer: `Sent because someone entered this address on <a href="${escapeHtml(websiteUrl)}" style="color:${colors.caramel};text-decoration:underline">${escapeHtml(siteLabel(websiteUrl))}</a>.`,
    }),
  };
}
