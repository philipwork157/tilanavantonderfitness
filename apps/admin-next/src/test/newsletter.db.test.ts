/** Database tests for the newsletter. Need TEST_DATABASE_URL (throwaway Postgres). */
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  blogPosts,
  createDatabase,
  newsletterCampaigns,
  newsletterDeliveries,
  newsletterSubscribers,
  users,
  type Database,
} from '@tilana/db';
import {
  confirmSubscription,
  startSubscription,
  subscriberCounts,
  unsubscribe,
} from '@/server/services/newsletter-subscribers';
import { CampaignError, createCampaign, deliveryCounts, markTestSent, updateCampaign } from '@/server/services/newsletter-campaigns';
import { prepareCampaignSend, resumeCampaign, runCampaignDeliveries } from '@/server/services/newsletter-sending';
import { applySesEvent } from '@/server/services/ses-events';
import type { OutgoingEmail } from '@/server/utils/email-routing';

const url = process.env.TEST_DATABASE_URL;
const noSleep = async () => {};

describe.skipIf(!url)('newsletter (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 2 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table newsletter_deliveries, newsletter_campaigns, newsletter_subscribers, blog_posts, users restart identity cascade`);
    await db.insert(users).values({ email: 'tilana@example.com' });
  });

  afterAll(async () => {
    await close?.();
  });

  /** Signs someone up and confirms them. */
  async function subscribed(email: string) {
    const result = await startSubscription(db, { email, source: 'test' });
    if (result.action !== 'send-confirmation') throw new Error('expected a confirmation');
    expect(await confirmSubscription(db, result.token)).toBe(true);
  }

  async function publishedPost() {
    const [post] = await db.insert(blogPosts).values({
      title: 'Protein', slug: 'protein', excerpt: 'Why protein helps.', status: 'published', publishedAt: new Date(),
    }).returning();
    return post!;
  }

  async function readyCampaign() {
    const post = await publishedPost();
    const id = await createCampaign(db, post.id, 1);
    await markTestSent(db, id);
    return id;
  }

  describe('subscribing', () => {
    it('stores a pending subscriber and only the hash of the confirmation token', async () => {
      const result = await startSubscription(db, { email: ' Anna@Example.com ', source: 'website-footer' });
      expect(result.action).toBe('send-confirmation');
      const [row] = await db.select().from(newsletterSubscribers);
      expect(row).toMatchObject({ email: 'anna@example.com', status: 'pending', source: 'website-footer' });
      expect(row!.confirmationTokenHash).not.toBe(result.action === 'send-confirmation' ? result.token : '');
      expect(row!.unsubscribeToken).toHaveLength(43);
    });

    it('confirms once, and expired or reused links fail', async () => {
      const result = await startSubscription(db, { email: 'anna@example.com', source: 'test' });
      if (result.action !== 'send-confirmation') throw new Error('expected a confirmation');
      expect(await confirmSubscription(db, result.token, new Date(Date.now() + 49 * 60 * 60 * 1000))).toBe(false);
      expect(await confirmSubscription(db, result.token)).toBe(true);
      expect(await confirmSubscription(db, result.token)).toBe(false);
      const [row] = await db.select().from(newsletterSubscribers);
      expect(row?.status).toBe('subscribed');
      expect(row?.confirmedAt).toBeInstanceOf(Date);
    });

    it('sends nothing to people already subscribed or asked again within two minutes', async () => {
      await subscribed('anna@example.com');
      expect((await startSubscription(db, { email: 'anna@example.com', source: 'test' })).action).toBe('none');

      const now = new Date();
      expect((await startSubscription(db, { email: 'ben@example.com', source: 'test' }, now)).action).toBe('send-confirmation');
      expect((await startSubscription(db, { email: 'ben@example.com', source: 'test' }, new Date(now.getTime() + 60_000))).action).toBe('none');
      expect((await startSubscription(db, { email: 'ben@example.com', source: 'test' }, new Date(now.getTime() + 3 * 60_000))).action).toBe('send-confirmation');
    });

    it('unsubscribes with the personal token, also when clicked twice', async () => {
      await subscribed('anna@example.com');
      const [row] = await db.select().from(newsletterSubscribers);
      expect(await unsubscribe(db, row!.unsubscribeToken)).toBe(true);
      expect(await unsubscribe(db, row!.unsubscribeToken)).toBe(true);
      expect(await unsubscribe(db, 'x'.repeat(43))).toBe(false);
      const counts = await subscriberCounts(db);
      expect(counts).toEqual({ subscribed: 0, pending: 0, unsubscribed: 1, suppressed: 0 });
    });

    it('lets someone who unsubscribed sign up again with a new confirmation', async () => {
      await subscribed('anna@example.com');
      const [row] = await db.select().from(newsletterSubscribers);
      await unsubscribe(db, row!.unsubscribeToken);
      const again = await startSubscription(db, { email: 'anna@example.com', source: 'test' });
      expect(again.action).toBe('send-confirmation');
    });
  });

  describe('campaigns', () => {
    it('needs a published post and starts from its title and summary', async () => {
      const [draft] = await db.insert(blogPosts).values({ title: 'Draft', slug: 'draft' }).returning();
      await expect(createCampaign(db, draft!.id, 1)).rejects.toBeInstanceOf(CampaignError);
      const post = await publishedPost();
      const id = await createCampaign(db, post.id, 1);
      const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, id));
      expect(campaign).toMatchObject({ subject: 'Protein', previewText: 'Why protein helps.', status: 'draft' });
    });

    it('needs a new test email after every edit', async () => {
      const id = await readyCampaign();
      const [post] = await db.select().from(blogPosts);
      await updateCampaign(db, id, { blogPostId: post!.id, subject: 'New subject', previewText: '', introduction: 'Hi' });
      await subscribed('anna@example.com');
      await expect(prepareCampaignSend(db, id, { userId: 1, recipientCount: 1 })).rejects.toThrow('Send a test email first');
    });

    it('refuses to send when the reviewed number of recipients changed', async () => {
      const id = await readyCampaign();
      await subscribed('anna@example.com');
      await subscribed('ben@example.com');
      await expect(prepareCampaignSend(db, id, { userId: 1, recipientCount: 1 })).rejects.toThrow('subscriber list changed');
    });

    it('emails every subscriber once with their own unsubscribe token', async () => {
      const id = await readyCampaign();
      await subscribed('anna@example.com');
      await subscribed('ben@example.com');
      await startSubscription(db, { email: 'pending@example.com', source: 'test' });
      expect(await prepareCampaignSend(db, id, { userId: 1, recipientCount: 2 })).toEqual({ recipientCount: 2 });
      await expect(prepareCampaignSend(db, id, { userId: 1, recipientCount: 2 })).rejects.toThrow('already been sent');

      const sent: OutgoingEmail[] = [];
      const tokens: string[] = [];
      const result = await runCampaignDeliveries(db, id, {
        buildEmail: (person) => {
          tokens.push(person.unsubscribeToken);
          return { to: [person.email], subject: 's', text: 't' };
        },
        send: async (email) => {
          sent.push(email);
          return { messageId: `msg-${email.to[0]}` };
        },
        sleep: noSleep,
      });

      expect(result).toBe('sent');
      expect(sent.map(email => email.to[0])).toEqual(['anna@example.com', 'ben@example.com']);
      expect(new Set(tokens).size).toBe(2);
      expect(await deliveryCounts(db, id)).toMatchObject({ sent: 2, queued: 0 });
      const [campaign] = await db.select().from(newsletterCampaigns);
      expect(campaign?.status).toBe('sent');
      expect(campaign?.finishedAt).toBeInstanceOf(Date);

      // Running again sends nothing more.
      expect(await runCampaignDeliveries(db, id, { buildEmail: () => { throw new Error('no'); }, send: async () => ({ messageId: null }), sleep: noSleep })).toBe('stopped');
    });

    it('skips people who unsubscribed after sending started', async () => {
      const id = await readyCampaign();
      await subscribed('anna@example.com');
      await subscribed('ben@example.com');
      await prepareCampaignSend(db, id, { userId: 1, recipientCount: 2 });
      const [ben] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, 'ben@example.com'));
      await unsubscribe(db, ben!.unsubscribeToken);

      const sent: string[] = [];
      await runCampaignDeliveries(db, id, {
        buildEmail: person => ({ to: [person.email], subject: 's', text: 't' }),
        send: async (email) => {
          sent.push(email.to[0]!);
          return { messageId: null };
        },
        sleep: noSleep,
      });
      expect(sent).toEqual(['anna@example.com']);
      expect(await deliveryCounts(db, id)).toMatchObject({ sent: 1, skipped: 1 });
    });

    it('retries rate limits, pauses on an account problem and resumes without duplicates', async () => {
      const id = await readyCampaign();
      await subscribed('anna@example.com');
      await subscribed('ben@example.com');
      await subscribed('cara@example.com');
      await prepareCampaignSend(db, id, { userId: 1, recipientCount: 3 });

      const sent: string[] = [];
      let calls = 0;
      const first = await runCampaignDeliveries(db, id, {
        buildEmail: person => ({ to: [person.email], subject: 's', text: 't' }),
        send: async (email) => {
          calls++;
          if (calls === 1) throw Object.assign(new Error('slow down'), { name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } });
          if (email.to[0] === 'ben@example.com') throw Object.assign(new Error('Sending paused for this account'), { name: 'SendingPausedException', $metadata: { httpStatusCode: 400 } });
          sent.push(email.to[0]!);
          return { messageId: null };
        },
        retryDelaysMs: [0],
        sleep: noSleep,
      });
      expect(first).toBe('paused');
      expect(sent).toEqual(['anna@example.com']);
      const [paused] = await db.select().from(newsletterCampaigns);
      expect(paused?.status).toBe('paused');
      expect(paused?.pauseReason).toContain('Sending paused for this account');
      expect(await deliveryCounts(db, id)).toMatchObject({ sent: 1, queued: 2 });

      expect(await resumeCampaign(db, id)).toBe(true);
      const second = await runCampaignDeliveries(db, id, {
        buildEmail: person => ({ to: [person.email], subject: 's', text: 't' }),
        send: async (email) => {
          sent.push(email.to[0]!);
          return { messageId: null };
        },
        sleep: noSleep,
      });
      expect(second).toBe('sent');
      expect(sent).toEqual(['anna@example.com', 'ben@example.com', 'cara@example.com']);
    });

    it('marks emails interrupted mid-send as failed instead of sending them again', async () => {
      const id = await readyCampaign();
      await subscribed('anna@example.com');
      await prepareCampaignSend(db, id, { userId: 1, recipientCount: 1 });
      await db.execute(sql`update newsletter_deliveries set status = 'sending', updated_at = now() - interval '1 hour'`);

      const sent: string[] = [];
      const result = await runCampaignDeliveries(db, id, {
        buildEmail: person => ({ to: [person.email], subject: 's', text: 't' }),
        send: async (email) => {
          sent.push(email.to[0]!);
          return { messageId: null };
        },
        sleep: noSleep,
      });
      expect(result).toBe('sent');
      expect(sent).toEqual([]);
      expect(await deliveryCounts(db, id)).toMatchObject({ failed: 1 });
    });
  });

  describe('bounces and complaints', () => {
    async function sentTo(email: string, messageId: string) {
      const id = await readyCampaign();
      await subscribed(email);
      await prepareCampaignSend(db, id, { userId: 1, recipientCount: 1 });
      await runCampaignDeliveries(db, id, {
        buildEmail: person => ({ to: [person.email], subject: 's', text: 't' }),
        send: async () => ({ messageId }),
        sleep: noSleep,
      });
      return id;
    }

    it('suppresses the subscriber after a permanent bounce', async () => {
      await sentTo('anna@example.com', 'ses-1');
      const outcome = await applySesEvent(db, {
        notificationType: 'Bounce',
        mail: { messageId: 'ses-1' },
        bounce: { bounceType: 'Permanent', bounceSubType: 'NoEmail', bouncedRecipients: [{ emailAddress: 'anna@example.com', diagnosticCode: 'smtp; 550 5.1.1 user unknown' }] },
      });
      expect(outcome).toBe('bounced');
      const [person] = await db.select().from(newsletterSubscribers);
      expect(person).toMatchObject({ status: 'bounced' });
      expect(person?.suppressionReason).toContain('550 5.1.1');
      const [delivery] = await db.select().from(newsletterDeliveries);
      expect(delivery?.status).toBe('bounced');
    });

    it('suppresses after a complaint (configuration-set event format)', async () => {
      await sentTo('anna@example.com', 'ses-2');
      expect(await applySesEvent(db, {
        eventType: 'Complaint',
        mail: { messageId: 'ses-2' },
        complaint: { complaintFeedbackType: 'abuse', complainedRecipients: [{ emailAddress: 'anna@example.com' }] },
      })).toBe('complained');
      const [person] = await db.select().from(newsletterSubscribers);
      expect(person?.status).toBe('complained');
    });

    it('ignores temporary bounces and suppresses confirmation-email bounces by address', async () => {
      await startSubscription(db, { email: 'typo@exmaple.com', source: 'test' });
      expect(await applySesEvent(db, { notificationType: 'Bounce', bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'typo@exmaple.com' }] } })).toBe('ignored');
      expect(await applySesEvent(db, { notificationType: 'Bounce', mail: { messageId: 'unknown' }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'typo@exmaple.com' }] } })).toBe('bounced');
      const [person] = await db.select().from(newsletterSubscribers);
      expect(person?.status).toBe('bounced');
    });

    it('never includes suppressed people in the next campaign', async () => {
      await sentTo('anna@example.com', 'ses-3');
      await applySesEvent(db, { notificationType: 'Bounce', mail: { messageId: 'ses-3' }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'anna@example.com' }] } });
      await subscribed('ben@example.com');
      const [post] = await db.select().from(blogPosts);
      const next = await createCampaign(db, post!.id, 1);
      await markTestSent(db, next);
      expect(await prepareCampaignSend(db, next, { userId: 1, recipientCount: 1 })).toEqual({ recipientCount: 1 });
    });
  });
});
