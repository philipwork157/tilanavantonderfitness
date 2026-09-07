export interface CustomerAccessEmailTemplateInput {
  firstName: string;
  signInUrl: string;
  intendedEmail: string;
  redirectedToDevelopment: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Builds the branded HTML and plain-text versions of a customer access email. */
export function renderCustomerAccessEmail(input: CustomerAccessEmailTemplateInput) {
  const firstName = toSingleLine(input.firstName);
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
  const developmentNotice = input.redirectedToDevelopment
    ? `Development preview — intended customer: ${input.intendedEmail}`
    : '';
  const subject = `${input.redirectedToDevelopment ? '[DEV] ' : ''}Your Tilana program access link`;
  const text = [
    ...(developmentNotice ? [developmentNotice, ''] : []),
    'TILANA VAN TONDER',
    'Your program library',
    '',
    greeting,
    '',
    'Use this secure, one-time link to sign in and access the programs connected to your purchase:',
    input.signInUrl,
    '',
    'The program PDF is available securely inside your account; it is not attached to this email.',
    'If you did not request this link, you can safely ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { padding: 20px 10px !important; }
        .email-card { border-radius: 22px !important; }
        .email-header, .email-content { padding: 28px 22px !important; }
        .email-title { font-size: 35px !important; }
        .access-button { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f6e4d9;color:#0f0e13;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your secure link to access your Tilana program library.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f6e4d9;">
      <tr>
        <td class="email-shell" align="center" style="padding:40px 16px;">
          <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#fffaf7;border:1px solid #e0c3ae;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(97,70,53,.14);">
            ${developmentNotice ? `<tr><td style="padding:12px 24px;background-color:#0f0e13;color:#fffaf7;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(developmentNotice)}</td></tr>` : ''}
            <tr>
              <td class="email-header" style="padding:38px 40px;background-color:#c9d2b3;">
                <p style="margin:0 0 18px;color:#614635;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Your program library</p>
                <h1 class="email-title" style="margin:0;color:#0f0e13;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.08;font-weight:500;">Your next chapter<br><em style="color:#a87e63;font-weight:400;">is ready.</em></h1>
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:38px 40px;">
                <p style="margin:0 0 16px;color:#0f0e13;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.5;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 28px;color:#614635;font-size:16px;line-height:1.75;">Use the secure, one-time link below to sign in and access the programs connected to your purchase.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                  <tr>
                    <td align="center" style="padding:0 0 30px;">
                      <a class="access-button" href="${escapeHtml(input.signInUrl)}" style="display:inline-block;padding:17px 30px;background-color:#0f0e13;border-radius:999px;color:#fffaf7;font-size:15px;font-weight:700;text-decoration:none;">Access my programs&nbsp; →</a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f6e4d9;border-radius:18px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <p style="margin:0 0 6px;color:#614635;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Secure access</p>
                      <p style="margin:0;color:#614635;font-size:13px;line-height:1.7;">Your program PDF is available inside your account rather than attached to this email. The sign-in link expires and can only be used securely.</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#a87e63;font-size:12px;line-height:1.7;text-align:center;">If you did not request this link, you can safely ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 30px;background-color:#0f0e13;">
                <p style="margin:0 0 4px;color:#d5a27f;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-style:italic;">Tilana van Tonder</p>
                <p style="margin:0;color:#e0c3ae;font-size:11px;line-height:1.5;letter-spacing:1.2px;text-transform:uppercase;">Move better · Feel stronger · Live healthier</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#a87e63;font-size:11px;line-height:1.5;">Sent securely from tilanavantonder.co.za</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
