import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import type { Database } from '@tilana/db/server';
import { paymentEvents } from '@tilana/db/schema';
import { sanitizePaystackEvent } from '@server/utils/paystack-event-evidence';
import { processPaystackEvent } from '@server/services/paystack';
import { redactExpiredPaymentEventPayloads } from '@server/services/payment-recovery';
import { seedPendingPayment, readPaymentState, type PaymentFixture } from './paystack-database';

const historical: { key: string; digest: string; provider: string; payload: unknown }[] = [];
let refundFixture: PaymentFixture;
let disputeFixture: PaymentFixture;
let processedKey: string;

/** Upgrade a populated pre-SEC-02 schema, preserving original digests and internal attribution. */
export async function prepareEvidenceUpgrade(db: Database) {
  refundFixture = await seedPendingPayment(db);
  disputeFixture = await seedPendingPayment(db);
  const rows: { provider: string; event: string; payload: unknown; paymentId?: number }[] = [];
  for (const event of ['charge.success', 'refund.processed']) {
    for (const data of [undefined, null, [], 'SECRET', 42, { amount: { authorization_code: 'SECRET' }, gateway_response: { customer: 'SECRET' } }]) {
      rows.push({ provider: 'paystack', event, payload: { event, ...(data !== undefined && { data }) } });
    }
  }
  rows.push({ provider: 'internal', event: 'admin.recovery.reconcile', payload: { administratorUserId: 2147483647, previousReviewReason: 'Review required' } });
  rows.push({ provider: 'paystack', event: 'refund.processed', paymentId: refundFixture.paymentId,
    payload: { event: 'refund.processed', data: { id: 'legacy-refund', transaction_reference: refundFixture.reference, amount: 3000, currency: 'ZAR', domain: 'test', customer: 'SECRET' } } });
  rows.push({ provider: 'paystack', event: 'charge.dispute.resolve', paymentId: disputeFixture.paymentId,
    payload: { event: 'charge.dispute.resolve', data: { id: 'legacy-dispute', domain: 'test', status: 'resolved', resolution: 'merchant-accepted', transaction: { id: disputeFixture.paymentId, reference: disputeFixture.reference, domain: 'test', amount: 10000, currency: 'ZAR', customer: 'SECRET' } } } });
  for (const row of rows) {
    const key = `upgrade:${randomUUID()}`;
    const [inserted] = await db.$client`insert into payment_events
      (payment_id, provider, provider_event_key, event_type, processing_status, payload)
      values (${row.paymentId ?? null}, ${row.provider}, ${key}, ${row.event}, 'received', ${JSON.stringify(row.payload)}::jsonb)
      returning encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') as digest`;
    historical.push({ key, digest: inserted!.digest as string, provider: row.provider, payload: row.payload });
  }
  processedKey = `processed-upgrade:${randomUUID()}`;
  const [processed] = await db.$client`insert into payment_events
    (provider, provider_event_key, event_type, processing_status, payload, received_at, processed_at)
    values ('paystack', ${processedKey}, 'charge.success', 'processed', '{"event":"charge.success","data":null}'::jsonb,
      now() - interval '40 days', now() - interval '40 days')
    returning encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') as digest`;
  historical.push({ key: processedKey, digest: processed!.digest as string, provider: 'paystack', payload: null });
  const oldMigration = await readFile(new URL('../../../../supabase/migrations/20260919135337_shallow_flatman.sql', import.meta.url), 'utf8');
  // Demonstrate the actual previous failure; DDL and data changes roll back together.
  await expect(db.transaction(async tx => {
    for (const statement of oldMigration.split('--> statement-breakpoint')) await tx.execute(sql.raw(statement));
  })).rejects.toThrow();
  const preparation = await readFile(new URL('../../../../scripts/prepare-sec02-upgrade.sql', import.meta.url), 'utf8');
  const connection = await db.$client.reserve();
  try {
    await connection.unsafe(preparation);
    await connection.unsafe(preparation); // Safe retry without rehashing repaired payloads.
  } finally { await connection`rollback`; connection.release(); }
}

export function registerEvidenceUpgradeCases(getDatabase: () => Database) {
  describe('typed evidence populated upgrade', () => {
    it('preserves original digests, internal events and no rejected secrets across the complete upgrade', async () => {
      for (const original of historical) {
        const [stored] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, original.key));
        expect(stored?.payloadDigest).toBe(original.digest);
        if (original.provider === 'internal') expect(stored?.payload).toEqual(original.payload);
        else expect(JSON.stringify(stored?.payload)).not.toContain('SECRET');
      }
      expect(await getDatabase().$client`select 1 from information_schema.columns where table_name = 'payment_events' and column_name = 'retention_upgrade_digest'`).toHaveLength(0);
    });
    it('replays a valid retained refund and dispute after charge fulfillment', async () => {
      for (const fixture of [refundFixture, disputeFixture]) {
        await processPaystackEvent({ event: 'charge.success', data: { id: fixture.paymentId, reference: fixture.reference, status: 'success', amount: 10000, currency: 'ZAR', domain: 'test' } }, `fulfil:${fixture.reference}`);
        const [pending] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.paymentId, fixture.paymentId)).orderBy(paymentEvents.id);
        await processPaystackEvent(pending!.payload, pending!.providerEventKey);
      }
      expect((await readPaymentState(getDatabase(), refundFixture)).payment?.status).toBe('partially_refunded');
      expect((await readPaymentState(getDatabase(), disputeFixture)).payment?.status).toBe('reversed');
    });
    it('keeps SQL and runtime scalar projection aligned on hostile and valid values', async () => {
      const values = [null, [], {}, 'SECRET', 'X'.repeat(1000), -1, 1.5, 0, 9007199254740992, 'ZAR', 'test', '2026-09-21T00:00:00Z'];
      for (const value of values) {
        const payload = { event: 'charge.success', data: Object.fromEntries(['id','reference','status','amount','currency','fees','channel','paid_at','domain','gateway_response'].map(key => [key, value])) };
        const [row] = await getDatabase().$client`select sanitize_payment_evidence_v1(${JSON.stringify(payload)}::jsonb) as payload`;
        expect(row!.payload).toEqual(sanitizePaystackEvent(payload));
      }
    });
    it('expires upgraded processed details while preserving their original digest and status', async () => {
      await redactExpiredPaymentEventPayloads();
      const [stored] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, processedKey));
      expect(stored).toMatchObject({ processingStatus: 'processed', payload: { redacted: true }, payloadExpiresAt: null,
        payloadDigest: historical.find(row => row.key === processedKey)!.digest });
    });
    it('does not turn a rejected refund identifier into an identifier-less refund on replay', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      await processPaystackEvent({ event: 'charge.success', data: { id: fixture.paymentId, reference: fixture.reference,
        status: 'success', amount: 10000, currency: 'ZAR', domain: 'test' } }, `charge:${fixture.reference}`);
      const key = `rejected:${fixture.reference}`;
      await processPaystackEvent({ event: 'refund.processed', data: { id: { secret: 'SECRET' }, transaction_reference: fixture.reference,
        amount: 3000, currency: 'ZAR', domain: 'test' } }, key);
      const [stored] = await db.select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key));
      expect(stored).toMatchObject({ processingStatus: 'failed', payload: { evidenceRejected: true } });
      expect(JSON.stringify(stored?.payload)).not.toContain('SECRET');
      await processPaystackEvent(stored!.payload, `replay:${key}`);
      expect((await readPaymentState(db, fixture)).payment).toMatchObject({ status: 'succeeded', refundedAmountCents: 0 });
    });
    it('refuses preparation after SEC-02 has already applied', async () => {
      const script = await readFile(new URL('../../../../scripts/prepare-sec02-upgrade.sql', import.meta.url), 'utf8');
      // Use one reserved connection so the failed explicit transaction can be rolled back.
      const connection = await getDatabase().$client.reserve();
      try { await expect(connection.unsafe(script)).rejects.toThrow('already applied'); }
      finally { await connection`rollback`; connection.release(); }
    });
  });
}
