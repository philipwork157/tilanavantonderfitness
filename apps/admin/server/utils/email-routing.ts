/** Pure email rules, kept free of Nuxt/AWS imports so they can be unit tested. */

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string[];
  /** Overrides NUXT_EMAIL_FROM_NAME, e.g. "Tilana van Tonder" for the newsletter. */
  fromName?: string;
  /** Extra headers such as List-Unsubscribe. */
  headers?: { name: string; value: string }[];
}

/**
 * Development safety: when a redirect address is set, every email goes there
 * instead of to real people, and the subject shows who it was meant for.
 * In development (`requireRedirect`) sending without a redirect is refused.
 */
export function routeEmail(
  email: OutgoingEmail,
  options: { devRedirectTo?: string; requireRedirect?: boolean },
): OutgoingEmail {
  const redirect = options.devRedirectTo?.trim();
  if (!redirect) {
    if (options.requireRedirect) {
      throw new Error('Set NUXT_EMAIL_DEV_REDIRECT_TO before sending email in development.');
    }
    return email;
  }
  return {
    ...email,
    to: [redirect],
    subject: `[DEV to ${email.to.join(', ')}] ${email.subject}`,
  };
}

/** "Name" <address>, with characters that could break the header removed. */
export function formatFromAddress(address: string, name?: string): string {
  const cleanName = name?.replace(/[\r\n]+/g, ' ').replace(/["<>]/g, '').replace(/\s+/g, ' ').trim();
  return cleanName ? `"${cleanName}" <${address}>` : address;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
