import 'server-only';
/**
 * Shared look of every email (newsletter, confirmations, program deliveries):
 * tables and inline styles, because email apps ignore most CSS.
 */
import { escapeHtml } from '../utils/email-routing';

export const FROM_NAME = 'Tilana van Tonder';
export const colors = {
  page: '#f6e4d9',
  card: '#fffaf7',
  border: '#e0c3ae',
  sage: '#c9d2b3',
  terracotta: '#d5a27f',
  caramel: '#7d5c47',
  chocolate: '#614635',
  ink: '#0f0e13',
};
export const fonts = {
  heading: 'Georgia, \'Times New Roman\', serif',
  body: 'Montserrat, Arial, Helvetica, sans-serif',
};

/** Plain paragraphs from text typed in the admin (blank line = new paragraph). */
export function paragraphs(text: string, style: string): string {
  return text.trim().split(/\n\s*\n/).filter(Boolean)
    .map(block => `<p style="${style}">${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function layout(options: { title: string; preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${colors.page};color:${colors.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${colors.page}">${escapeHtml(options.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${colors.page}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:0 0 20px;font-family:${fonts.heading};font-size:22px;font-style:italic;color:${colors.chocolate}">Tilana van Tonder</td></tr>
<tr><td style="background:${colors.card};border:1px solid ${colors.border};border-radius:24px;overflow:hidden">${options.body}</td></tr>
<tr><td style="padding:24px 12px 0;font-family:${fonts.body};font-size:12px;line-height:1.7;color:${colors.caramel};text-align:center">${options.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** "tilanavantonder.co.za" from the website address, for link text. */
export function siteLabel(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).host.replace(/^www\./, '');
  }
  catch {
    return websiteUrl;
  }
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:999px;background:${colors.terracotta}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;border-radius:999px;font-family:${fonts.body};font-size:15px;font-weight:700;color:${colors.ink};text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}
