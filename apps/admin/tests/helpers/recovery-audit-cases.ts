import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Database } from '@tilana/db/server';
import { paymentEvents, payments, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { redactExpiredPaymentEventPayloads, requestPaymentRecovery } from '@server/services/payment-recovery';
import { seedPendingPayment } from './paystack-database';

/** Real application identity, including the Supabase-owned UUID bridge. */
export async function seedRecoveryActor(db: Database) {
  const uuid = randomUUID();
  await db.$client`insert into auth.users (id) values (${uuid})`;
  const [actor] = await db.insert(users).values({ supabaseId: uuid, firstName: 'Audit', lastName: 'Operator', email: `${uuid}@example.test` }).returning();
  return actor!.id;
}

const legacy: { key: string; actor: number | null; paymentId: number; payload: object }[] = [];

/** Seed the preceding schema using SQL so new columns are never assumed present. */
export async function seedLegacyRecoveryAudit(db: Database) {
  const actor = await seedRecoveryActor(db);
  const fixture = await seedPendingPayment(db);
  for (const payload of [
    { administratorUserId: actor }, { redacted: true }, { administratorUserId: 2147483647 },
    { administratorUserId: '1' }, { administratorUserId: { id: actor } },
    { administratorUserId: 999999999999999 }, { administratorUserId: -1 },
  ]) {
    const key = `legacy-recovery:${randomUUID()}`;
    await db.$client`insert into payment_events
      (payment_id, provider, provider_event_key, event_type, processing_status, payload, payload_digest, payload_expires_at, processed_at)
      values (${fixture.paymentId}, 'internal', ${key}, 'admin.recovery.reconcile', 'processed',
        ${JSON.stringify(payload)}::jsonb, ${'a'.repeat(64)}, now() - interval '1 day', now())`;
    legacy.push({ key, actor: payload.administratorUserId === actor ? actor : null, paymentId: fixture.paymentId, payload });
  }
}

/** Protect operator attribution independently of expiring reconciliation details. */
export function registerRecoveryAuditCases(getDatabase: () => Database) {
  describe('durable recovery actor audit', () => {
    it('backfills valid existing identities without inventing missing or malformed actors', async () => {
      expect(legacy).toHaveLength(7);
      await redactExpiredPaymentEventPayloads();
      for (const row of legacy) {
        const [event] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, row.key));
        expect(event).toMatchObject({ actorUserId: row.actor, paymentId: row.paymentId,
          payload: row.actor ? { redacted: true } : row.payload, payloadDigest: 'a'.repeat(64) });
      }
    });

    it.each(['reconcile', 'acknowledge'] as const)('retains actor, action, target and timestamp after %s payload expiry', async action => {
      const db = getDatabase();
      const actor = await seedRecoveryActor(db);
      const fixture = await seedPendingPayment(db);
      await requestPaymentRecovery(fixture.paymentId, actor);
      if (action === 'acknowledge') await requestPaymentRecovery(fixture.paymentId, actor, action);
      const rows = await db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, fixture.paymentId));
      const audit = rows.find(row => row.eventType === `admin.recovery.${action}`)!;
      await redactExpiredPaymentEventPayloads(new Date(Date.now() + 31 * 86400_000));
      const [retained] = await db.select().from(paymentEvents).where(eq(paymentEvents.id, audit.id));
      expect(retained).toEqual({ ...audit, payload: { redacted: true }, payloadExpiresAt: null });
      expect(retained?.actorUserId).toBe(actor);
      for (const mutation of [{ actorUserId: null }, { paymentId: null }, { provider: 'paystack' },
        { eventType: 'other' }, { receivedAt: new Date(0) }, { payloadDigest: 'b'.repeat(64) }]) {
        await expect(db.update(paymentEvents).set(mutation).where(eq(paymentEvents.id, audit.id))).rejects.toThrow();
      }
      await expect(db.delete(paymentEvents).where(eq(paymentEvents.id, audit.id))).rejects.toThrow();
      await expect(db.delete(users).where(eq(users.id, actor))).rejects.toThrow();
      await expect(db.delete(payments).where(eq(payments.id, fixture.paymentId))).rejects.toThrow();
    });

    it('rolls back queued work when an actor does not exist', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      await expect(requestPaymentRecovery(fixture.paymentId, 2147483647)).rejects.toThrow();
      expect(await db.$client`select id from payment_recovery_jobs where payment_id = ${fixture.paymentId}`).toHaveLength(0);
      expect(await db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, fixture.paymentId))).toHaveLength(0);
    });

    it('rejects new unattributed recovery events at the database boundary', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      await expect(db.insert(paymentEvents).values({ paymentId: fixture.paymentId,
        provider: 'internal', providerEventKey: `missing-actor:${randomUUID()}`,
        eventType: 'admin.recovery.reconcile', processingStatus: 'processed',
        processedAt: new Date(), payload: {}, payloadDigest: 'a'.repeat(64),
      })).rejects.toThrow();
    });
  });
}
