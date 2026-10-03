import type { Database } from '@tilana/db/server';
import { clients, customerNotifications, orders } from '@tilana/db/schema';
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment, getCustomerAccountBaseUrl, getPaystackEnvironment } from '@server/utils/paystack-configuration';
import { customerPurchaseHistoryCondition } from '@server/utils/customer-purchase-history';
import { getSupabaseAdminClient } from '@server/utils/supabase-admin';
import { getEmailRecipient } from '@server/utils/email-delivery';
import { sendCustomerAccessEmail } from './customer-access-emails';
import { getPurchaseProgramAttachments } from './purchase-program-attachments';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Only fixed internal failure categories may reach logs, never provider errors or links. */
class CustomerDeliveryError extends Error {
  constructor(readonly failure: 'email-configuration' | 'magic-link' | 'timeout') {
    super('Customer email delivery failed.');
  }
}

/** Called inside successful fulfillment: one notification per order, including webhook replays. */
export async function queuePurchaseAccess(transaction: Transaction, orderId: number) {
  const [order] = await transaction.select({ clientId: orders.clientId }).from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Purchase notification order missing.');
  await transaction.insert(customerNotifications).values({ clientId: order.clientId, orderId, kind: 'purchase', deduplicationKey: `purchase:${orderId}`, nextAttemptAt: new Date() }).onConflictDoNothing();
}

/** Coalesce rapid requests per customer; no email address or bearer token is persisted in the queue. */
export async function queueCustomerLogin(clientId: number) {
  const key = `login:${clientId}:${Math.floor(Date.now() / 300_000)}`;
  const database = getDatabase();
  await database.insert(customerNotifications).values({ clientId, kind: 'login', deduplicationKey: key, nextAttemptAt: new Date() }).onConflictDoNothing();
  const [job] = await database.select({ id: customerNotifications.id }).from(customerNotifications).where(eq(customerNotifications.deduplicationKey, key));
  return job!.id;
}

/** Recheck eligibility immediately before sending; login tokens are fresh on every retry. */
async function sendNotification(job: typeof customerNotifications.$inferSelect, signal: AbortSignal) {
  const database = getDatabase();
  const [buyer] = await database.select({ email: job.kind === 'purchase'
    ? sql<string>`coalesce(${orders.customerEmail}, ${clients.email})` : clients.email,
  firstName: clients.firstName }).from(clients)
    .innerJoin(orders, and(eq(orders.clientId, clients.id), job.kind === 'purchase'
      ? and(eq(orders.id, job.orderId!), eq(orders.status, 'paid')) : customerPurchaseHistoryCondition()))
    .where(eq(clients.id, job.clientId)).limit(1);
  // Old login requests must not keep issuing unsolicited fresh tokens indefinitely.
  if (!buyer || (job.kind === 'login' && Date.now() - job.createdAt.getTime() > 60 * 60_000)) return false;
  // Fail before minting an Auth token or reading PDFs when the test inbox is missing.
  const config = useRuntimeConfig();
  try {
    const test = getPaystackEnvironment(config) === 'test';
    getEmailRecipient(buyer.email, { test, live: !test }, config);
  } catch { throw new CustomerDeliveryError('email-configuration'); }
  const base = getCustomerAccountBaseUrl();
  const url = new URL('/account/sign-in', `${base}/`);
  const attachments = job.kind === 'purchase' ? await getPurchaseProgramAttachments(job.orderId!, job.clientId, signal) : undefined;
  if (attachments === null) return false;
  if (job.kind === 'login') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bound generation inside this function so a late Auth response cannot trigger a late SES send.
    const result = await Promise.race([
      getSupabaseAdminClient().auth.admin.generateLink({ type: 'magiclink', email: buyer.email.toLowerCase() }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new CustomerDeliveryError('magic-link')), 8_000); }),
    ]).finally(() => clearTimeout(timer));
    const { data, error } = result;
    if (error || !data.properties?.hashed_token) throw new CustomerDeliveryError('magic-link');
    url.pathname = '/api/customer/auth/confirm';
    url.searchParams.set('token_hash', data.properties.hashed_token);
    url.searchParams.set('type', 'email');
    url.searchParams.set('next', '/account/programs');
  }
  signal.throwIfAborted();
  await sendCustomerAccessEmail({ intendedRecipient: buyer.email, firstName: buyer.firstName, signInUrl: url.toString(), instructionsOnly: job.kind === 'purchase', attachments, signal });
  return true;
}

/** At-least-once outbox. Versioned leases protect acknowledgements, not SES exactly-once delivery. */
export async function deliverCustomerNotifications(jobId?: number) {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  let sent = 0;
  let failed = 0;
  let canceled = 0;
  for (let index = 0; index < (jobId ? 1 : 5); index++) {
    const now = new Date();
    const job = await database.transaction(async transaction => {
      const [pending] = await transaction.select().from(customerNotifications).where(and(
        jobId ? eq(customerNotifications.id, jobId) : undefined,
        isNull(customerNotifications.sentAt), isNull(customerNotifications.canceledAt), lte(customerNotifications.nextAttemptAt, now),
        or(isNull(customerNotifications.leaseUntil), lte(customerNotifications.leaseUntil, now)),
      )).orderBy(asc(customerNotifications.nextAttemptAt), asc(customerNotifications.id)).limit(1).for('update', { skipLocked: true });
      if (!pending) return null;
      const [leased] = await transaction.update(customerNotifications).set({ attempts: pending.attempts + 1, leaseVersion: pending.leaseVersion + 1,
        leaseUntil: new Date(now.getTime() + 10 * 60_000) }).where(eq(customerNotifications.id, pending.id)).returning();
      return leased!;
    });
    if (!job) break;
    const ownership = and(eq(customerNotifications.id, job.id), eq(customerNotifications.leaseVersion, job.leaseVersion));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const delivered = await Promise.race([sendNotification(job, controller.signal), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new CustomerDeliveryError('timeout')); }, 30_000);
      })]);
      await database.update(customerNotifications).set({ ...(delivered ? { sentAt: new Date() } : { canceledAt: new Date() }), leaseUntil: null }).where(ownership);
      if (delivered) sent++; else canceled++;
    } catch (error) {
      // Never log tokens, provider errors or customer addresses.
      console.error('Customer email delivery failed.', {
        notificationId: job.id, kind: job.kind,
        failure: error instanceof CustomerDeliveryError ? error.failure : 'delivery',
      });
      await database.update(customerNotifications).set({ leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 12))),
      }).where(ownership);
      failed++;
    } finally { clearTimeout(timer); }
  }
  return { sent, failed, canceled };
}

/** Best-effort delivery after fulfillment commits. Provider outages never undo payment/access. */
export async function deliverPurchaseNotification(orderId: number) {
  if (String(useRuntimeConfig().customerNotificationsEnabled) !== 'true') return;
  try {
    const [job] = await getDatabase().select({ id: customerNotifications.id }).from(customerNotifications)
      .where(and(eq(customerNotifications.orderId, orderId), eq(customerNotifications.kind, 'purchase'))).limit(1);
    if (job) await deliverCustomerNotifications(job.id);
  } catch {
    console.error('Purchase email delivery requires attention.');
  }
}

/** Protected scheduler activation is independent of billing and defaults to disabled. */
export async function runCustomerNotificationWorker() {
  if (String(useRuntimeConfig().customerNotificationsEnabled) !== 'true') return { disabled: true, sent: 0, failed: 0, canceled: 0 };
  return { disabled: false, ...await deliverCustomerNotifications() };
}
