import 'server-only';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  blogPosts,
  newsletterCampaigns,
  newsletterDeliveries,
  newsletterSubscribers,
  type Database,
} from '@tilana/db';
import type { OutgoingEmail } from '../utils/email-routing';
import { CampaignError } from './newsletter-campaigns';
import { activeSubscribers } from './newsletter-subscribers';

const BATCH_SIZE = 10;
/** Rows stuck in "sending" this long were interrupted (e.g. a server restart). */
const STALE_SENDING_MS = 10 * 60 * 1000;

/**
 * Locks in the recipients and marks the campaign as sending. Refuses unless a
 * test email was sent after the last edit, the post is published, and the
 * number of subscribers still matches what Tilana reviewed.
 */
export async function prepareCampaignSend(
  db: Database,
  campaignId: number,
  options: { userId: number; recipientCount: number; now?: Date },
): Promise<{ recipientCount: number }> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.id, campaignId)).for('update').limit(1);
    if (!campaign) throw new CampaignError('Campaign not found.', 404);
    if (campaign.status !== 'draft') throw new CampaignError('This campaign has already been sent.', 409);
    if (!campaign.testSentAt) throw new CampaignError('Send a test email first and check it.', 409);

    const [post] = campaign.blogPostId
      ? await tx.select({ status: blogPosts.status }).from(blogPosts).where(eq(blogPosts.id, campaign.blogPostId)).limit(1)
      : [];
    if (post?.status !== 'published') throw new CampaignError('The blog post is not published.', 409);

    const recipients = await activeSubscribers(tx as unknown as Database);
    if (!recipients.length) throw new CampaignError('There are no confirmed subscribers yet.', 409);
    if (recipients.length !== options.recipientCount) {
      throw new CampaignError('The subscriber list changed while you were reviewing it. Please review the recipients again.', 409);
    }

    await tx.insert(newsletterDeliveries)
      .values(recipients.map(person => ({ campaignId, subscriberId: person.id, email: person.email })))
      .onConflictDoNothing();
    await tx.update(newsletterCampaigns).set({
      status: 'sending',
      recipientCount: recipients.length,
      startedAt: now,
      sentBy: options.userId,
      pauseReason: null,
    }).where(eq(newsletterCampaigns.id, campaignId));
    return { recipientCount: recipients.length };
  });
}

export async function resumeCampaign(db: Database, campaignId: number): Promise<boolean> {
  const resumed = await db.update(newsletterCampaigns).set({ status: 'sending', pauseReason: null })
    .where(and(eq(newsletterCampaigns.id, campaignId), eq(newsletterCampaigns.status, 'paused')))
    .returning({ id: newsletterCampaigns.id });
  return resumed.length > 0;
}

/**
 * How to react to an SES error: try the same email again shortly (rate
 * limits, network) or pause the whole campaign (account or setup problem
 * that would fail for every recipient).
 */
export function classifySendError(error: unknown): 'retry' | 'pause' {
  const name = (error as { name?: string }).name ?? '';
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  if (/TooManyRequests|Throttl/i.test(name)) return 'retry';
  if (status === undefined || status >= 500) return 'retry';
  return 'pause';
}

export function describeSendError(error: unknown): string {
  const name = (error as { name?: string }).name;
  const message = error instanceof Error ? error.message : String(error);
  return (name && !message.startsWith(name) ? `${name}: ${message}` : message).slice(0, 500);
}

export interface RunDependencies {
  /** Build the email for one subscriber (their unsubscribe token is included). */
  buildEmail: (recipient: { email: string; unsubscribeToken: string }) => OutgoingEmail;
  send: (email: OutgoingEmail) => Promise<{ messageId: string | null }>;
  /** Pause between emails; keeps well under the SES sending rate. */
  delayMs?: number;
  retryDelaysMs?: number[];
  /** Wait before checking again when other emails are still in flight. */
  idleRecheckMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type RunResult = 'sent' | 'paused' | 'stopped';

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Sends every queued email of a campaign, a few at a time. Each row is claimed
 * before sending (safe with more than one server), and rows interrupted
 * mid-send are marked failed rather than risk emailing someone twice.
 */
export async function runCampaignDeliveries(db: Database, campaignId: number, deps: RunDependencies): Promise<RunResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const retryDelays = deps.retryDelaysMs ?? [1000, 4000, 15000];

  for (;;) {
    await db.update(newsletterDeliveries).set({
      status: 'failed',
      error: 'Interrupted while sending. Not sent again, to avoid a duplicate email.',
    }).where(and(
      eq(newsletterDeliveries.campaignId, campaignId),
      eq(newsletterDeliveries.status, 'sending'),
      lt(newsletterDeliveries.updatedAt, new Date(Date.now() - STALE_SENDING_MS)),
    ));

    const [campaign] = await db.select({ status: newsletterCampaigns.status })
      .from(newsletterCampaigns).where(eq(newsletterCampaigns.id, campaignId)).limit(1);
    if (campaign?.status !== 'sending') return 'stopped';

    const claimed = await db.execute<{ id: number; subscriber_id: number | null; email: string }>(sql`
      update ${newsletterDeliveries} set status = 'sending', updated_at = now()
      where id in (
        select id from ${newsletterDeliveries}
        where campaign_id = ${campaignId} and status = 'queued'
        order by id limit ${BATCH_SIZE}
        for update skip locked
      )
      returning id, subscriber_id, email`);
    const batch = [...claimed].map(row => ({ id: Number(row.id), subscriberId: row.subscriber_id === null ? null : Number(row.subscriber_id), email: row.email }))
      .sort((a, b) => a.id - b.id);

    if (!batch.length) {
      if (await finishIfDone(db, campaignId)) return 'sent';
      // Another server is still sending its last emails, or rows were left
      // mid-send by a restart; check again shortly.
      await sleep(deps.idleRecheckMs ?? 30_000);
      continue;
    }

    const subscriberIds = batch.map(row => row.subscriberId).filter((id): id is number => id !== null);
    const people = subscriberIds.length
      ? await db.select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status, unsubscribeToken: newsletterSubscribers.unsubscribeToken })
        .from(newsletterSubscribers).where(inArray(newsletterSubscribers.id, subscriberIds))
      : [];

    for (const [index, delivery] of batch.entries()) {
      const person = people.find(row => row.id === delivery.subscriberId);
      // Unsubscribed, bounced or complained since the campaign started.
      if (person?.status !== 'subscribed') {
        await setDelivery(db, delivery.id, { status: 'skipped', error: 'No longer subscribed when this email was due.' });
        continue;
      }

      const outcome = await sendWithRetries(deps, { email: delivery.email, unsubscribeToken: person.unsubscribeToken }, retryDelays, sleep);
      if (outcome.ok) {
        await setDelivery(db, delivery.id, { status: 'sent', sesMessageId: outcome.messageId, sentAt: new Date(), error: null });
      }
      else {
        // Put this and the rest of the batch back in the queue, then pause.
        const unsent = batch.slice(index).map(row => row.id);
        await db.update(newsletterDeliveries).set({ status: 'queued' }).where(inArray(newsletterDeliveries.id, unsent));
        await db.update(newsletterCampaigns).set({ status: 'paused', pauseReason: outcome.reason })
          .where(and(eq(newsletterCampaigns.id, campaignId), eq(newsletterCampaigns.status, 'sending')));
        return 'paused';
      }
      if (deps.delayMs) await sleep(deps.delayMs);
    }
  }
}

async function sendWithRetries(
  deps: RunDependencies,
  recipient: { email: string; unsubscribeToken: string },
  retryDelays: number[],
  sleep: (ms: number) => Promise<void>,
): Promise<{ ok: true; messageId: string | null } | { ok: false; reason: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { messageId } = await deps.send(deps.buildEmail(recipient));
      return { ok: true, messageId };
    }
    catch (error) {
      const delay = retryDelays[attempt];
      if (classifySendError(error) === 'retry' && delay !== undefined) {
        await sleep(delay);
        continue;
      }
      return { ok: false, reason: describeSendError(error) };
    }
  }
}

function setDelivery(db: Database, id: number, values: Partial<typeof newsletterDeliveries.$inferInsert>) {
  return db.update(newsletterDeliveries).set(values).where(eq(newsletterDeliveries.id, id));
}

/** Marks the campaign sent once nothing is queued or in flight. */
async function finishIfDone(db: Database, campaignId: number): Promise<boolean> {
  const finished = await db.update(newsletterCampaigns).set({ status: 'sent', finishedAt: new Date() }).where(and(
    eq(newsletterCampaigns.id, campaignId),
    eq(newsletterCampaigns.status, 'sending'),
    sql`not exists (select 1 from ${newsletterDeliveries} d where d.campaign_id = ${campaignId} and d.status in ('queued', 'sending'))`,
  )).returning({ id: newsletterCampaigns.id });
  return finished.length > 0;
}

/** Campaigns that should be sending (used to resume after a restart). */
export async function campaignsToResume(db: Database): Promise<number[]> {
  const rows = await db.select({ id: newsletterCampaigns.id }).from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.status, 'sending'));
  return rows.map(row => row.id);
}
