import type { NewsletterSubscribeRequest } from '@tilana/contracts/newsletter';
import { newsletterSubscribers, newsletterTokens, type NewsletterTokenPurpose } from '@tilana/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;
const UNSUBSCRIBE_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
export const NEWSLETTER_PRIVACY_VERSION = '2026-08-24';

function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('hex');
}

async function insertToken(subscriberId: number, purpose: NewsletterTokenPurpose) {
  const token = createToken();
  const ttl = purpose === 'confirmation' ? CONFIRMATION_TTL_MS : UNSUBSCRIBE_TTL_MS;
  await getDatabase().insert(newsletterTokens).values({
    subscriberId,
    purpose,
    tokenHash: await hashToken(token),
    expiresAt: new Date(Date.now() + ttl),
  });
  return token;
}

export async function startNewsletterSubscription(input: NewsletterSubscribeRequest) {
  const database = getDatabase();
  const email = input.email.trim().toLowerCase();
  const [existing] = await database
    .select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  if (existing?.status === 'subscribed') return { confirmationToken: null };

  const now = new Date();
  let subscriberId = existing?.id;
  if (subscriberId) {
    await database.update(newsletterSubscribers).set({
      status: 'pending',
      source: input.source,
      privacyPolicyVersion: NEWSLETTER_PRIVACY_VERSION,
      consentedAt: now,
      confirmedAt: null,
      unsubscribedAt: null,
      updatedAt: now,
    }).where(eq(newsletterSubscribers.id, subscriberId));
  } else {
    const [subscriber] = await database.insert(newsletterSubscribers).values({
      email,
      source: input.source,
      privacyPolicyVersion: NEWSLETTER_PRIVACY_VERSION,
      consentedAt: now,
    }).returning({ id: newsletterSubscribers.id });
    if (!subscriber) throw new Error('Newsletter subscriber was not created.');
    subscriberId = subscriber.id;
  }

  await database.delete(newsletterTokens).where(and(
    eq(newsletterTokens.subscriberId, subscriberId),
    eq(newsletterTokens.purpose, 'confirmation'),
    isNull(newsletterTokens.usedAt),
  ));
  return { confirmationToken: await insertToken(subscriberId, 'confirmation') };
}

export async function confirmNewsletterSubscription(token: string): Promise<boolean> {
  const database = getDatabase();
  const tokenHash = await hashToken(token);
  const [record] = await database.select({
    id: newsletterTokens.id,
    subscriberId: newsletterTokens.subscriberId,
  }).from(newsletterTokens).where(and(
    eq(newsletterTokens.tokenHash, tokenHash),
    eq(newsletterTokens.purpose, 'confirmation'),
    isNull(newsletterTokens.usedAt),
    gt(newsletterTokens.expiresAt, new Date()),
  )).limit(1);
  if (!record) return false;

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction.update(newsletterTokens).set({ usedAt: now }).where(eq(newsletterTokens.id, record.id));
    await transaction.update(newsletterSubscribers).set({
      status: 'subscribed',
      confirmedAt: now,
      unsubscribedAt: null,
      updatedAt: now,
    }).where(eq(newsletterSubscribers.id, record.subscriberId));
  });
  return true;
}

export async function createNewsletterUnsubscribeToken(subscriberId: number) {
  return insertToken(subscriberId, 'unsubscribe');
}

export async function unsubscribeFromNewsletter(token: string): Promise<boolean> {
  const database = getDatabase();
  const tokenHash = await hashToken(token);
  const [record] = await database.select({ id: newsletterTokens.id, subscriberId: newsletterTokens.subscriberId })
    .from(newsletterTokens).where(and(
      eq(newsletterTokens.tokenHash, tokenHash),
      eq(newsletterTokens.purpose, 'unsubscribe'),
      isNull(newsletterTokens.usedAt),
      gt(newsletterTokens.expiresAt, new Date()),
    )).limit(1);
  if (!record) return false;

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction.update(newsletterTokens).set({ usedAt: now }).where(eq(newsletterTokens.id, record.id));
    await transaction.update(newsletterSubscribers).set({
      status: 'unsubscribed',
      unsubscribedAt: now,
      updatedAt: now,
    }).where(eq(newsletterSubscribers.id, record.subscriberId));
  });
  return true;
}
