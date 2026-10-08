import 'server-only';
/** The "New sale" email to Tilana. Pure function; every value is HTML-escaped. */
import { escapeHtml, type OutgoingEmail } from '../utils/email-routing';
import { button, colors, FROM_NAME, fonts, layout } from './email-layout';

export interface SaleNotice {
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  items: { label: string; priceCents: number }[];
  totalCents: number;
  /** Whether the PDFs reached the buyer. */
  delivered: boolean;
  testMode: boolean;
  adminUrl: string | null;
}

const rand = (cents: number) => `R${(cents / 100).toFixed(cents % 100 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

export function saleNotificationEmail(to: string, sale: SaleNotice): OutgoingEmail {
  const subject = `${sale.testMode ? '[Test payment] ' : ''}New sale: ${rand(sale.totalCents)} · ${sale.orderNumber}`;
  const text = `margin:0 0 14px;font-family:${fonts.body};font-size:15px;line-height:1.6;color:${colors.chocolate}`;
  const rows = sale.items
    // Divider lines go between rows only: a top border on the first row draws a
    // straight line across the box's rounded corners (seen in Gmail).
    .map((item, index) => {
      const divider = index ? `border-top:1px solid ${colors.border};` : '';
      return `<tr><td style="padding:10px 14px;${divider}font-family:${fonts.body};font-size:15px;color:${colors.ink}">${escapeHtml(item.label)}</td><td align="right" style="padding:10px 14px;${divider}font-family:${fonts.body};font-size:15px;color:${colors.ink}">${rand(item.priceCents)}</td></tr>`;
    })
    .join('');
  const delivery = sale.delivered
    ? 'The PDFs were emailed to the buyer.'
    : '<strong>The PDFs could not be emailed to the buyer.</strong> Please check the order in the admin and send them by hand.';
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-family:${fonts.heading};font-size:28px;font-weight:400;color:${colors.ink}">New sale ${sale.testMode ? '(test payment)' : ''}</h1>
<p style="${text}"><strong>${escapeHtml(sale.buyerName)}</strong> (${escapeHtml(sale.buyerEmail)}) bought:</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${colors.border};border-radius:12px;background:${colors.page};margin-bottom:16px">${rows}
<tr><td style="padding:10px 14px;border-top:1px solid ${colors.border};font-family:${fonts.body};font-weight:700">Total</td><td align="right" style="padding:10px 14px;border-top:1px solid ${colors.border};font-family:${fonts.body};font-weight:700">${rand(sale.totalCents)}</td></tr></table>
<p style="${text}">Order ${escapeHtml(sale.orderNumber)}. ${delivery}</p>
${sale.adminUrl ? button(sale.adminUrl, 'Open sales') : ''}
</td></tr></table>`;
  return {
    to: [to],
    fromName: FROM_NAME,
    subject,
    text: [
      `New sale${sale.testMode ? ' (test payment)' : ''}: ${sale.orderNumber}`,
      `${sale.buyerName} (${sale.buyerEmail})`,
      ...sale.items.map(item => `- ${item.label}: ${rand(item.priceCents)}`),
      `Total: ${rand(sale.totalCents)}`,
      sale.delivered ? 'The PDFs were emailed to the buyer.' : 'The PDFs could NOT be emailed to the buyer. Please send them by hand.',
    ].join('\n'),
    html: layout({ title: subject, preheader: `${sale.buyerName} bought ${sale.items.length} program${sale.items.length === 1 ? '' : 's'}.`, body, footer: 'Sent by your website admin.' }),
  };
}
