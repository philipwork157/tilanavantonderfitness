import 'server-only';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { newsletterSubscribers, type Database, type NewsletterSubscriber } from '@tilana/db';
import type { NewsletterSubscriberView } from '@tilana/contracts/admin-newsletter';
import { createNewsletterToken, hashNewsletterToken } from '../utils/newsletter-tokens';

export const CONFIRMATION_VALID_MS = 48 * 60 * 60 * 1000;
/** A new confirmation email is not sent more often than this per address. */
export const CONFIRMATION_RESEND_AFTER_MS = 2 * 60 * 1000;

export type StartSubscriptionResult =
  | { action: 'send-confirmation'; email: string; token: string }
  | { action: 'none' };

/**
 * Website sign-up. Saves (or refreshes) the person as `pending` and returns a
 * confirmation token to email. Already-subscribed people and very recent
 * repeats get no email, so the form can't be used to flood someone's inbox.
 * The caller always answers the visitor the same way.
 */
export async function startSubscription(
  db: Database,
  input: { email: string; source: string },
  now = new Date(),
): Promise<StartSubscriptionResult> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);

  if (existing?.status === 'subscribed') return { action: 'none' };
  if (existing?.status === 'pending' && existing.confirmationSentAt
    && now.getTime() - existing.confirmationSentAt.getTime() < CONFIRMATION_RESEND_AFTER_MS) {
    return { action: 'none' };
  }

  const token = createNewsletterToken();
  const confirmation = {
    status: 'pending' as const,
    source: input.source,
    consentedAt: now,
    confirmationTokenHash: hashNewsletterToken(token),
    confirmationExpiresAt: new Date(now.getTime() + CONFIRMATION_VALID_MS),
    confirmationSentAt: now,
  };

  if (existing) {
    await db.update(newsletterSubscribers).set(confirmation).where(eq(newsletterSubscribers.id, existing.id));
  }
  else {
    await db.insert(newsletterSubscribers)
      .values({ email, unsubscribeToken: createNewsletterToken(), ...confirmation })
      // Two sign-ups at the same moment: the first one wins, the second sends nothing.
      .onConflictDoNothing({ target: newsletterSubscribers.email });
    const [saved] = await db.select({ hash: newsletterSubscribers.confirmationTokenHash })
      .from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
    if (saved?.hash !== confirmation.confirmationTokenHash) return { action: 'none' };
  }
  return { action: 'send-confirmation', email, token };
}

/** The link in the confirmation email. True when the person is now subscribed. */
export async function confirmSubscription(db: Database, token: string, now = new Date()): Promise<boolean> {
  const [confirmed] = await db.update(newsletterSubscribers).set({
    status: 'subscribed',
    confirmedAt: now,
    unsubscribedAt: null,
    suppressedAt: null,
    suppressionReason: null,
    confirmationTokenHash: null,
    confirmationExpiresAt: null,
  }).where(and(
    eq(newsletterSubscribers.confirmationTokenHash, hashNewsletterToken(token)),
    eq(newsletterSubscribers.status, 'pending'),
    gt(newsletterSubscribers.confirmationExpiresAt, now),
  )).returning({ id: newsletterSubscribers.id });
  return Boolean(confirmed);
}

/**
 * The unsubscribe link in every newsletter. Works every time it is used, so a
 * second click still shows success. False only for an unknown token.
 */
export async function unsubscribe(db: Database, token: string, now = new Date()): Promise<boolean> {
  const [subscriber] = await db.select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status })
    .from(newsletterSubscribers).where(eq(newsletterSubscribers.unsubscribeToken, token)).limit(1);
  if (!subscriber) return false;
  if (subscriber.status === 'subscribed' || subscriber.status === 'pending') {
    await db.update(newsletterSubscribers).set({
      status: 'unsubscribed',
      unsubscribedAt: now,
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
    }).where(eq(newsletterSubscribers.id, subscriber.id));
  }
  return true;
}

/**
 * Amazon SES reported a permanent bounce or a spam complaint. The address is
 * never emailed again unless the person signs up and confirms again.
 */
export async function suppressSubscriber(
  db: Database,
  who: { id: number } | { email: string },
  kind: 'bounced' | 'complained',
  reason: string,
  at = new Date(),
): Promise<void> {
  await db.update(newsletterSubscribers).set({
    status: kind,
    suppressedAt: at,
    suppressionReason: reason.slice(0, 500),
    confirmationTokenHash: null,
    confirmationExpiresAt: null,
  }).where('id' in who
    ? eq(newsletterSubscribers.id, who.id)
    : eq(newsletterSubscribers.email, who.email.trim().toLowerCase()));
}

const VIEW_STATUSES: Record<NewsletterSubscriberView, NewsletterSubscriber['status'][]> = {
  subscribed: ['subscribed'],
  pending: ['pending'],
  unsubscribed: ['unsubscribed'],
  suppressed: ['bounced', 'complained'],
};

export async function listSubscribers(db: Database, view: NewsletterSubscriberView) {
  return db.select({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
    status: newsletterSubscribers.status,
    source: newsletterSubscribers.source,
    consentedAt: newsletterSubscribers.consentedAt,
    confirmedAt: newsletterSubscribers.confirmedAt,
    unsubscribedAt: newsletterSubscribers.unsubscribedAt,
    suppressedAt: newsletterSubscribers.suppressedAt,
    suppressionReason: newsletterSubscribers.suppressionReason,
  }).from(newsletterSubscribers)
    .where(inArray(newsletterSubscribers.status, VIEW_STATUSES[view]))
    .orderBy(view === 'subscribed' ? desc(newsletterSubscribers.confirmedAt) : desc(newsletterSubscribers.updatedAt))
    .limit(5000);
}

export async function subscriberCounts(db: Database): Promise<Record<NewsletterSubscriberView, number>> {
  const rows = await db.select({ status: newsletterSubscribers.status, count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers).groupBy(newsletterSubscribers.status);
  const count = (statuses: string[]) => rows.filter(row => statuses.includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  return {
    subscribed: count(VIEW_STATUSES.subscribed),
    pending: count(VIEW_STATUSES.pending),
    unsubscribed: count(VIEW_STATUSES.unsubscribed),
    suppressed: count(VIEW_STATUSES.suppressed),
  };
}

/** Everyone a campaign would go to right now, oldest subscriber first. */
export async function activeSubscribers(db: Database) {
  return db.select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, 'subscribed'))
    .orderBy(asc(newsletterSubscribers.confirmedAt), asc(newsletterSubscribers.id));
}
