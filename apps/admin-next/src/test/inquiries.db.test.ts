/**
 * Database tests for saving enquiries. Need an isolated, throwaway Postgres:
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @tilana/admin-next test
 */
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, inquiries, orderItems, orders, type Database } from '@tilana/db';
import { contactFormRequestSchema } from '@tilana/contracts/contact';
import { createInquiry, inquiryNotificationEmail, matchInquiryOrders, type SavedInquiry } from '@/server/services/inquiries';

const url = process.env.TEST_DATABASE_URL;
const input = contactFormRequestSchema.parse({
  name: 'Anna Smith',
  email: 'Anna@Example.com',
  interest: 'move',
  message: 'I would like to start the beginner program.',
  consent: true,
});

describe.skipIf(!url)('createInquiry (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table inquiries, order_items, orders restart identity cascade`);
  });

  afterAll(async () => {
    await close?.();
  });

  it('saves the enquiry with the shown label and consent time, then records the notification', async () => {
    const acceptedAt = new Date('2026-10-05T12:00:00Z');
    let notified: SavedInquiry | undefined;
    const result = await createInquiry(db, input, { now: acceptedAt, notify: async (row) => { notified = row; } });

    expect(result).toEqual({ id: 1, notified: true });
    expect(notified?.email).toBe('anna@example.com');
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, 1));
    expect(row).toMatchObject({
      name: 'Anna Smith',
      email: 'anna@example.com',
      interest: 'move',
      interestLabel: 'Beginner · Volume 1',
      status: 'new',
      notificationError: null,
    });
    expect(row!.privacyAcceptedAt.toISOString()).toBe(acceptedAt.toISOString());
    expect(row!.notifiedAt).toBeInstanceOf(Date);
  });

  it('keeps the enquiry and stores the reason when the email fails', async () => {
    const result = await createInquiry(db, input, { notify: async () => { throw new Error('SES rejected the sender'); } });

    expect(result).toEqual({ id: 1, notified: false });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, 1));
    expect(row!.notifiedAt).toBeNull();
    expect(row!.notificationError).toBe('SES rejected the sender');
  });

  it('only allows known statuses', async () => {
    await createInquiry(db, input, { notify: async () => {} });
    await expect(db.execute(sql`update inquiries set status = 'spam' where id = 1`)).rejects.toThrow();
  });

  describe('order, payment or refund enquiries', () => {
    async function order(orderNumber: string, email: string, status: 'paid' | 'failed' | 'refunded', createdAt: string) {
      const [row] = await db.insert(orders).values({
        orderNumber,
        reference: `${orderNumber}-ref`,
        idempotencyKey: `${orderNumber}-key`,
        status,
        firstName: 'Anna',
        lastName: 'Smith',
        email,
        totalCents: 35000,
        paymentMode: 'live',
        deliveryStatus: status === 'paid' ? 'sent' : 'pending',
        paidAt: status === 'failed' ? null : new Date(createdAt),
        createdAt: new Date(createdAt),
      }).returning();
      await db.insert(orderItems).values({ orderId: row!.id, slug: 'move-volume-1', label: 'Beginner · Volume 1', priceCents: 35000 });
    }

    const refund = (extra: Record<string, unknown>) => contactFormRequestSchema.parse({
      name: 'Anna Smith',
      email: 'anna@example.com',
      interest: 'order',
      orderTopic: 'refund',
      consent: true,
      ...extra,
    });

    it('saves the topic, the order number and the purchase email', async () => {
      await createInquiry(db, refund({ orderNumber: 'tv 7k4q9p', purchaseEmail: 'Old@Example.com' }), { notify: async () => {} });
      const [row] = await db.select().from(inquiries);
      expect(row).toMatchObject({ interest: 'order', orderTopic: 'refund', orderNumber: 'TV-7K4Q9P', purchaseEmail: 'old@example.com', message: '' });
    });

    it('matches the order by its number, even when it was bought with another email', async () => {
      await order('TV-7K4Q9P', 'other@example.com', 'paid', '2026-10-12T08:00:00Z');
      const match = await matchInquiryOrders(db, { orderNumber: 'TV-7K4Q9P', purchaseEmail: null, email: 'anna@example.com' });
      expect(match.matchedBy).toBe('order-number');
      expect(match.orders.map(o => o.orderNumber)).toEqual(['TV-7K4Q9P']);
      expect(match.orders[0]!.programs).toEqual(['Beginner · Volume 1']);
    });

    it('falls back to the latest orders for the purchase or contact email, and says when the number is unknown', async () => {
      await order('TV-AAAAAA', 'anna@example.com', 'failed', '2026-10-10T08:00:00Z');
      await order('TV-BBBBBB', 'old@example.com', 'paid', '2026-10-11T08:00:00Z');
      await order('TV-CCCCCC', 'someone@example.com', 'paid', '2026-10-12T08:00:00Z');
      const match = await matchInquiryOrders(db, { orderNumber: 'TV-ZZZZZZ', purchaseEmail: 'old@example.com', email: 'anna@example.com' });
      expect(match).toMatchObject({ matchedBy: 'email', orderNumberNotFound: true });
      expect(match.orders.map(o => o.orderNumber)).toEqual(['TV-BBBBBB', 'TV-AAAAAA']);

      const none = await matchInquiryOrders(db, { orderNumber: null, purchaseEmail: null, email: 'nobody@example.com' });
      expect(none).toEqual({ matchedBy: 'none', orderNumberNotFound: false, orders: [] });
    });

    it('puts the topic and the matched order in Tilana\'s email', async () => {
      await order('TV-7K4Q9P', 'anna@example.com', 'paid', '2026-10-12T08:00:00Z');
      let saved: SavedInquiry | undefined;
      await createInquiry(db, refund({ orderNumber: 'TV-7K4Q9P' }), { notify: async (row) => { saved = row; } });
      const email = inquiryNotificationEmail(saved!, 'tilana@example.com', await matchInquiryOrders(db, saved!));
      expect(email.subject).toBe("I'd like a refund · Anna Smith · TV-7K4Q9P");
      expect(email.text).toContain("Needs help with: I'd like a refund");
      expect(email.text).toContain('Order number: TV-7K4Q9P');
      expect(email.text).toContain('TV-7K4Q9P · Paid · PDFs emailed · R350 · Beginner · Volume 1 · 12 Oct 2026');
      expect(email.html).toContain('Open Sales in the admin');
    });
  });
});
