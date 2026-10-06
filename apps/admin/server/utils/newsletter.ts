import { and, eq } from 'drizzle-orm';
import { blogPosts, newsletterCampaigns, type Database, type NewsletterCampaign } from '@tilana/db';
import type { CampaignEmailContent } from '../services/newsletter-emails';
import { campaignEmail } from '../services/newsletter-emails';
import { describeSendError, runCampaignDeliveries } from '../services/newsletter-sending';
import { blogImagePublicUrl, ensureEmailImage } from './blog-images';

/** NUXT_WEBSITE_URL without a trailing slash, e.g. https://tilanavantonder.co.za. */
export function websiteUrl(): string {
  const value = String(useRuntimeConfig().websiteUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(value)) {
    throw createError({ statusCode: 503, statusMessage: 'NUXT_WEBSITE_URL is not set, so email links cannot be made.' });
  }
  return value;
}

/** Development redirect address (NUXT_EMAIL_DEV_REDIRECT_TO), or null in production. */
export function devRedirectAddress(): string | null {
  return String(useRuntimeConfig().emailDevRedirectTo ?? '').trim().toLowerCase() || null;
}

/**
 * Who receives test emails: NUXT_NEWSLETTER_TEST_TO in production. In
 * development only the developer (NUXT_EMAIL_DEV_REDIRECT_TO) gets one.
 */
export function newsletterTestRecipients(): string[] {
  const developer = devRedirectAddress();
  if (developer) return [developer];
  return String(useRuntimeConfig().newsletterTestTo ?? '')
    .split(/[\s,]+/)
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export const unsubscribeUrl = (token: string) => `${websiteUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
export const confirmUrl = (token: string) => `${websiteUrl()}/newsletter/confirmed?token=${encodeURIComponent(token)}`;

/**
 * Everything in the email except the personal unsubscribe link. Emails use a
 * JPEG copy of the cover photo; the admin preview uses the original.
 */
export async function campaignContent(
  db: Database,
  campaign: Pick<NewsletterCampaign, 'blogPostId' | 'subject' | 'previewText' | 'introduction'>,
  options: { forEmail: boolean },
): Promise<Omit<CampaignEmailContent, 'unsubscribeUrl'>> {
  const [post] = campaign.blogPostId
    ? await db.select().from(blogPosts).where(eq(blogPosts.id, campaign.blogPostId)).limit(1)
    : [];
  if (!post) throw createError({ statusCode: 409, statusMessage: 'Choose a blog post for this email.' });

  const site = websiteUrl();
  return {
    subject: campaign.subject,
    previewText: campaign.previewText,
    introduction: campaign.introduction,
    websiteUrl: site,
    post: {
      title: post.title,
      excerpt: post.excerpt,
      category: post.category,
      url: `${site}/blog/${post.slug}`,
      imageUrl: options.forEmail ? await ensureEmailImage(post.coverImagePath) : blogImagePublicUrl(post.coverImagePath),
      imageAlt: post.coverImageAlt,
    },
  };
}

const running = new Set<number>();

/**
 * Sends a campaign in the background of this server process. The admin polls
 * for progress. Safe to call twice: a campaign runs at most once per process,
 * and rows are claimed one batch at a time in the database.
 */
export function startCampaignRunner(campaignId: number) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  const db = useDatabase();

  void (async () => {
    try {
      const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, campaignId)).limit(1);
      if (campaign?.status !== 'sending') return;
      const content = await campaignContent(db, campaign, { forEmail: true });
      await runCampaignDeliveries(db, campaignId, {
        buildEmail: person => campaignEmail(person.email, { ...content, unsubscribeUrl: unsubscribeUrl(person.unsubscribeToken) }),
        send: sendEmail,
        // About 4 emails a second, well under the SES sending rate.
        delayMs: 250,
      });
    }
    catch (error) {
      console.error(`Newsletter campaign ${campaignId} stopped`, error);
      await db.update(newsletterCampaigns).set({ status: 'paused', pauseReason: describeSendError(error) })
        .where(and(eq(newsletterCampaigns.id, campaignId), eq(newsletterCampaigns.status, 'sending')))
        .catch(() => undefined);
    }
    finally {
      running.delete(campaignId);
    }
  })();
}
