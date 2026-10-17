import 'server-only';
import { eq } from 'drizzle-orm';
import { inquiries, type Database } from '@tilana/db';
import { contactInterestLabels, type ContactFormRequest } from '@tilana/contracts/contact';
import { escapeHtml, type OutgoingEmail } from '../utils/email-routing';

export interface SavedInquiry {
  id: number;
  name: string;
  email: string;
  interestLabel: string;
  message: string;
  privacyAcceptedAt: Date;
}

/**
 * Save the enquiry first, then try to email Tilana. The enquiry is never lost
 * because of an email problem; the outcome is recorded on the row instead.
 */
export async function createInquiry(
  db: Database,
  input: ContactFormRequest,
  options: { notify: (inquiry: SavedInquiry) => Promise<void>; now?: Date },
): Promise<{ id: number; notified: boolean }> {
  const [inquiry] = await db.insert(inquiries).values({
    name: input.name,
    email: input.email.toLowerCase(),
    interest: input.interest,
    interestLabel: contactInterestLabels[input.interest],
    message: input.message,
    privacyAcceptedAt: options.now ?? new Date(),
  }).returning();

  try {
    await options.notify(inquiry!);
    await db.update(inquiries).set({ notifiedAt: new Date(), notificationError: null }).where(eq(inquiries.id, inquiry!.id));
    return { id: inquiry!.id, notified: true };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inquiries).set({ notificationError: message.slice(0, 500) }).where(eq(inquiries.id, inquiry!.id));
    return { id: inquiry!.id, notified: false };
  }
}

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Johannesburg',
});

/** Notification for Tilana. Replying goes straight to the visitor. */
export function inquiryNotificationEmail(inquiry: SavedInquiry, to: string): OutgoingEmail {
  const accepted = `${dateFormat.format(inquiry.privacyAcceptedAt)} (SAST)`;
  const rows: [string, string][] = [
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Interested in', inquiry.interestLabel],
    ['Privacy policy accepted', accepted],
  ];

  const text = [
    'New enquiry from the website',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message:',
    inquiry.message,
    '',
    `Reply to this email to answer ${inquiry.name} directly.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6e4d9;font-family:Montserrat,Arial,sans-serif;color:#614635">
<div style="max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e0c3ae;border-radius:14px">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase">New enquiry</p>
<h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:400;font-size:24px;color:#0f0e13">${escapeHtml(inquiry.name)}</h1>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([label, value]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#765743;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f0e13">${escapeHtml(value)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 6px;font-size:14px;font-weight:600;color:#0f0e13">Message</p>
<p style="margin:0;font-size:14px;line-height:1.65;white-space:pre-wrap">${escapeHtml(inquiry.message)}</p>
<p style="margin:24px 0 0;font-size:12px;color:#765743">Reply to this email to answer ${escapeHtml(inquiry.name)} directly.</p>
</div></body></html>`;

  return {
    to: [to],
    replyTo: [inquiry.email],
    subject: `New enquiry from ${inquiry.name} · ${inquiry.interestLabel}`,
    text,
    html,
  };
}
