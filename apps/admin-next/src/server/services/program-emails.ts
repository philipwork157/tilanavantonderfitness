import 'server-only';
/**
 * The email that delivers purchased programs, with the PDFs attached. Pure
 * function (no database or AWS) so it can be tested and sent as a test from
 * the admin. Every value from the database is HTML-escaped.
 */
import { escapeHtml, type EmailAttachment, type OutgoingEmail } from '../utils/email-routing';
import { colors, FROM_NAME, fonts, layout, siteLabel } from './email-layout';

export interface ProgramDeliveryContent {
  firstName: string;
  /** Public order number; null for test emails. */
  orderNumber: string | null;
  /** Names of the attached programs, e.g. "Beginner · Volume 1". */
  programs: string[];
  websiteUrl: string;
  refundPolicyUrl: string;
}

const DISCLAIMER = 'The programs share general education based on personal experience. They are not a substitute for medical, physiotherapy, dietetic or other professional care. Please check with an appropriately qualified healthcare professional before you begin, especially during pregnancy, after birth or with an injury.';

function subjectFor(programs: string[]): string {
  return programs.length === 1 ? `Your program: ${programs[0]}` : 'Your programs from Tilana';
}

export function programDeliveryHtml(content: ProgramDeliveryContent, options: { test?: boolean } = {}): string {
  const text = `margin:0 0 18px;font-family:${fonts.body};font-size:16px;line-height:1.7;color:${colors.chocolate}`;
  const many = content.programs.length > 1;
  const list = content.programs
    // Lines between programs only; a line above the first one would cut across
    // the box's rounded top corners.
    .map((name, index) => `<tr><td style="padding:12px 16px;${index ? `border-top:1px solid ${colors.border};` : ''}font-family:${fonts.body};font-size:15px;font-weight:700;color:${colors.ink}">${escapeHtml(name)}</td></tr>`)
    .join('');
  const order = content.orderNumber
    ? `<p style="margin:0 0 6px;font-family:${fonts.body};font-size:13px;color:${colors.caramel}">Order number: <strong>${escapeHtml(content.orderNumber)}</strong></p>`
    : `<p style="margin:0 0 6px;font-family:${fonts.body};font-size:13px;color:${colors.caramel}"><strong>Test email:</strong> customers see their order number here.</p>`;
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:32px 32px 8px">
<p style="margin:0 0 10px;font-family:${fonts.body};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${colors.caramel}">Thank you for your order</p>
<h1 style="margin:0 0 20px;font-family:${fonts.heading};font-size:32px;font-weight:400;line-height:1.2;color:${colors.ink}">${many ? 'Your programs are here' : 'Your program is here'}</h1>
<p style="${text}">Hi ${escapeHtml(content.firstName)},</p>
<p style="${text}">Thank you so much for your purchase. ${many ? 'Your programs are' : 'Your program is'} attached to this email as ${many ? 'PDF files' : 'a PDF'}. Save ${many ? 'them' : 'it'} to your phone or computer so you always have ${many ? 'them' : 'it'} with you.</p>
</td></tr>
<tr><td style="padding:0 32px 24px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${colors.border};border-radius:16px;background:${colors.page}">${list}</table>
</td></tr>
<tr><td style="padding:0 32px 24px">
${order}
<p style="margin:0;font-family:${fonts.body};font-size:13px;line-height:1.6;color:${colors.caramel}">Can't see the attachment? Check that your email app shows attachments, or simply reply to this email and I'll help.</p>
</td></tr>
<tr><td style="padding:0 32px 28px;font-family:${fonts.body};font-size:12px;line-height:1.6;color:${colors.caramel}">${escapeHtml(DISCLAIMER)}</td></tr>
<tr><td style="padding:24px 32px 32px;background:${colors.sage};font-family:${fonts.body};font-size:15px;color:${colors.chocolate}">Enjoy every session. With love,<br><span style="font-family:${fonts.heading};font-size:24px;font-style:italic;color:${colors.ink}">Tilana</span></td></tr>
</table>`;
  const footer = `${options.test ? '<strong>Test email</strong> from the admin.<br>' : ''}You are receiving this because you bought ${many ? 'programs' : 'a program'} on <a href="${escapeHtml(content.websiteUrl)}" style="color:${colors.caramel};text-decoration:underline">${escapeHtml(siteLabel(content.websiteUrl))}</a>.<br><a href="${escapeHtml(content.refundPolicyUrl)}" style="color:${colors.caramel};text-decoration:underline">Refund policy</a>`;
  return layout({ title: subjectFor(content.programs), preheader: `${many ? 'Your programs are' : 'Your program is'} attached. Thank you for your order.`, body, footer });
}

export function programDeliveryText(content: ProgramDeliveryContent): string {
  return [
    `Hi ${content.firstName},`,
    '',
    'Thank you so much for your purchase. Attached to this email:',
    ...content.programs.map(name => `- ${name}`),
    '',
    content.orderNumber ? `Order number: ${content.orderNumber}` : 'Test email: customers see their order number here.',
    '',
    "Can't see the attachment? Reply to this email and I'll help.",
    '',
    DISCLAIMER,
    '',
    'Enjoy every session. With love,',
    'Tilana',
    '',
    `Refund policy: ${content.refundPolicyUrl}`,
  ].join('\n');
}

/** One delivery email with the program PDFs attached. */
export function programDeliveryEmail(
  to: string,
  content: ProgramDeliveryContent,
  attachments: EmailAttachment[],
  options: { test?: boolean; replyTo?: string } = {},
): OutgoingEmail {
  const subject = subjectFor(content.programs);
  return {
    to: [to],
    fromName: FROM_NAME,
    subject: options.test ? `[Test] ${subject}` : subject,
    text: programDeliveryText(content),
    html: programDeliveryHtml(content, options),
    ...(options.replyTo ? { replyTo: [options.replyTo] } : {}),
    attachments,
  };
}
