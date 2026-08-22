import { newsletterTokenSchema } from '@tilana/contracts/newsletter';
import { confirmNewsletterSubscription } from '../../services/newsletter-subscriptions';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const siteUrl = String(config.newsletterSiteUrl || '').trim().replace(/\/$/, '');
  if (!siteUrl) throw createError({ statusCode: 503, statusMessage: 'Newsletter service is not configured.' });

  const parsed = newsletterTokenSchema.safeParse(getQuery(event).token);
  const confirmed = parsed.success ? await confirmNewsletterSubscription(parsed.data) : false;
  return sendRedirect(event, `${siteUrl}/newsletter/confirmed?status=${confirmed ? 'success' : 'invalid'}`, 302);
});
