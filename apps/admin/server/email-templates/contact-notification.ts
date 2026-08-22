import {
  contactInterestLabels,
  type ContactFormRequest,
} from '@tilana/contracts/contact';

export type ContactNotificationTemplateInput = Pick<
  ContactFormRequest,
  'name' | 'email' | 'interest' | 'message'
> & {
  submissionId: string;
  submittedAt: Date;
};

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

function withHtmlLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Builds the branded HTML and plain-text versions of a contact notification. */
export function renderContactNotificationEmail(input: ContactNotificationTemplateInput) {
  const interest = contactInterestLabels[input.interest];
  const submittedAt = new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(input.submittedAt);
  const safeName = toSingleLine(input.name);
  const firstName = safeName.split(/\s+/)[0] || safeName;
  const subject = `New ${interest} enquiry from ${safeName}`;

  const text = [
    'TILANA VAN TONDER',
    'New website enquiry',
    '',
    `Hi Tilana, ${safeName} has contacted you through your website.`,
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Interested in: ${interest}`,
    `Submitted: ${submittedAt}`,
    '',
    'THEIR MESSAGE',
    input.message,
    '',
    `Reply directly to ${input.email}`,
    `Reference: ${input.submissionId}`,
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
        .detail-label, .detail-value { display: block !important; width: 100% !important; text-align: left !important; }
        .detail-value { padding-top: 2px !important; padding-bottom: 14px !important; }
        .reply-button { display: block !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f6e4d9;color:#0f0e13;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(safeName)} is interested in ${escapeHtml(interest)}. Reply directly from this email.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f6e4d9;">
      <tr>
        <td class="email-shell" align="center" style="padding:40px 16px;">
          <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#fffaf7;border:1px solid #e0c3ae;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(97,70,53,.14);">
            <tr>
              <td class="email-header" style="padding:38px 40px;background-color:#d5a27f;">
                <p style="margin:0 0 18px;color:#614635;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:2px;text-transform:uppercase;">New website enquiry</p>
                <h1 class="email-title" style="margin:0;color:#0f0e13;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.08;font-weight:500;">A new conversation<br>has started.</h1>
                <p style="margin:18px 0 0;color:#614635;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.5;font-style:italic;">${escapeHtml(safeName)} would love to hear from you.</p>
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:38px 40px;">
                <p style="margin:0 0 26px;color:#614635;font-size:16px;line-height:1.7;">Hi Tilana, here are the details from your latest website enquiry.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td class="detail-label" width="35%" style="padding:11px 0;border-bottom:1px solid #ead7ca;color:#a87e63;font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Name</td>
                    <td class="detail-value" width="65%" style="padding:11px 0;border-bottom:1px solid #ead7ca;color:#0f0e13;font-size:15px;font-weight:700;text-align:right;">${escapeHtml(safeName)}</td>
                  </tr>
                  <tr>
                    <td class="detail-label" width="35%" style="padding:11px 0;border-bottom:1px solid #ead7ca;color:#a87e63;font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Email</td>
                    <td class="detail-value" width="65%" style="padding:11px 0;border-bottom:1px solid #ead7ca;font-size:15px;text-align:right;"><a href="mailto:${escapeHtml(input.email)}" style="color:#614635;text-decoration:underline;">${escapeHtml(input.email)}</a></td>
                  </tr>
                  <tr>
                    <td class="detail-label" width="35%" style="padding:11px 0;border-bottom:1px solid #ead7ca;color:#a87e63;font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Interested in</td>
                    <td class="detail-value" width="65%" style="padding:11px 0;border-bottom:1px solid #ead7ca;color:#0f0e13;font-size:15px;font-weight:700;text-align:right;">${escapeHtml(interest)}</td>
                  </tr>
                  <tr>
                    <td class="detail-label" width="35%" style="padding:11px 0;color:#a87e63;font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Received</td>
                    <td class="detail-value" width="65%" style="padding:11px 0;color:#614635;font-size:15px;text-align:right;">${escapeHtml(submittedAt)}</td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:26px 0;background-color:#c9d2b3;border-radius:20px;">
                  <tr>
                    <td style="padding:25px 26px;">
                      <p style="margin:0 0 10px;color:#614635;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Their message</p>
                      <p style="margin:0;color:#0f0e13;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.65;">${withHtmlLineBreaks(input.message)}</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                  <tr>
                    <td align="center" style="padding:2px 0 26px;">
                      <a class="reply-button" href="mailto:${escapeHtml(input.email)}?subject=${encodeURIComponent(`Re: your ${interest} enquiry`)}" style="display:inline-block;padding:17px 30px;background-color:#0f0e13;border-radius:999px;color:#fffaf7;font-size:15px;font-weight:700;text-decoration:none;">Reply to ${escapeHtml(firstName)}</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;text-align:center;color:#a87e63;font-size:11px;line-height:1.6;">Enquiry reference: ${escapeHtml(input.submissionId)}</p>
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
