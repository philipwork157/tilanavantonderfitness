import { newsletterTokenSchema } from '@tilana/contracts/newsletter';
import { unsubscribeFromNewsletter } from '@server/services/newsletter-subscriptions';
import { applyContactCors } from '@server/utils/contact-security';

export default defineEventHandler(async (event) => {
  applyContactCors(event);
  const parsed = newsletterTokenSchema.safeParse((await readBody<{ token?: unknown }>(event))?.token);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid unsubscribe link.' });
  const unsubscribed = await unsubscribeFromNewsletter(parsed.data);
  if (!unsubscribed) throw createError({ statusCode: 400, statusMessage: 'This unsubscribe link is invalid or expired.' });
  return { ok: true };
});
