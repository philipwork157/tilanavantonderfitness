import {
  contactFormRequestSchema,
  contactValidationMessages,
  type ContactFormField,
} from '@tilana/contracts/contact';
import {
  applyContactCors,
  enforceContactRateLimit,
  getContactRequestIp,
  verifyContactTurnstile,
} from '../utils/contact-security';
import { createContactSubmission } from '../services/contact-submissions';
import { sendContactSubmissionNotification } from '../services/contact-notifications';

const MAX_REQUEST_BYTES = 20_000;

export default defineEventHandler(async (event) => {
  applyContactCors(event);

  const contentLength = Number(getHeader(event, 'content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large.' });
  }

  const parsed = contactFormRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    const invalidField = String(parsed.error.issues[0]?.path[0] ?? '') as ContactFormField;

    throw createError({
      statusCode: 400,
      statusMessage: contactValidationMessages[invalidField] ?? 'Please check the form and try again.',
    });
  }

  // Silently accept honeypot submissions so bots do not learn how they were detected.
  if (parsed.data.website) {
    setResponseStatus(event, 201);
    return { ok: true };
  }

  const ip = getContactRequestIp(event);
  await enforceContactRateLimit(ip);
  await verifyContactTurnstile(parsed.data.turnstileToken, ip);

  let submission: Awaited<ReturnType<typeof createContactSubmission>>;
  try {
    submission = await createContactSubmission(parsed.data);
  } catch (error) {
    console.error(
      'Failed to save contact submission.',
      error instanceof Error ? error.message : 'Unknown database error.',
    );
    throw createError({
      statusCode: 503,
      statusMessage: 'The enquiry could not be saved. Please try again shortly.',
    });
  }

  try {
    await sendContactSubmissionNotification({
      ...parsed.data,
      submissionId: submission.id,
      submittedAt: submission.createdAt,
    });
  } catch (error) {
    // The enquiry is already safely stored. Returning an error here would
    // encourage duplicate submissions, so notification failures are logged.
    console.error(
      `Failed to email contact notification for submission ${submission.id}.`,
      error instanceof Error ? error.message : 'Unknown email error.',
    );
  }

  setResponseStatus(event, 201);
  return { ok: true };
});
