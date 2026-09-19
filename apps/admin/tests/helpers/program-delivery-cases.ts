import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Database } from '@tilana/db/server';
import { orderItems, orders, payments, programAccess, programAuditEvents, programFiles, programs, programVolumes, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { deactivateProgramFile } from '@server/services/program-storage';
import { processPaystackEvent } from '@server/services/paystack';
import { seedPendingPayment } from './paystack-database';

/** Real trigger/service coverage for private files owed after catalogue withdrawal. */
export function registerProgramDeliveryCases(getDatabase: () => Database) {
  async function actor(db: Database) {
    const supabaseId = randomUUID();
    await db.$client`insert into auth.users (id) values (${supabaseId})`;
    return (await db.insert(users).values({ supabaseId, firstName: 'File', lastName: 'Admin', email: `${supabaseId}@example.test` }).returning())[0]!;
  }

  async function purchasedVolume(db: Database) {
    const fixture = await seedPendingPayment(db);
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, fixture.itemId));
    const [volume] = await db.select().from(programVolumes).where(eq(programVolumes.id, item!.programVolumeId!));
    const [file] = await db.insert(programFiles).values({
      programVolumeId: volume!.id,
      displayName: 'Customer programme',
      originalFilename: 'programme.pdf',
      r2Bucket: 'private-test',
      r2ObjectKey: `programs/${randomUUID()}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 100,
      uploadStatus: 'ready',
      etag: randomUUID(),
      isActive: true,
    }).returning();
    return { fixture, item: item!, volume: volume!, file: file! };
  }

  async function archive(db: Database, programId: number) {
    await db.update(programs).set({ status: 'archived' }).where(eq(programs.id, programId));
  }

  async function confirmCharge(fixture: Awaited<ReturnType<typeof seedPendingPayment>>) {
    await processPaystackEvent({ event: 'charge.success', data: {
      id: fixture.paymentId,
      reference: fixture.reference,
      amount: 10000,
      currency: 'ZAR',
      domain: 'test',
      status: 'success',
    } }, `delivery-${randomUUID()}`);
  }

  describe('owed program delivery against PostgreSQL', () => {
    it('blocks final-file deactivation after archive while active access exists', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      const administrator = await actor(db);
      await confirmCharge(subject.fixture);
      await archive(db, subject.volume.programId);

      await expect(deactivateProgramFile(subject.file.id, { reason: 'Withdraw' }, administrator.id))
        .rejects.toThrow('final active PDF owed');
      expect((await db.select().from(programFiles).where(eq(programFiles.id, subject.file.id)))[0]?.isActive).toBe(true);
      expect(await db.select().from(programAuditEvents).where(eq(programAuditEvents.entityId, subject.file.id))).toHaveLength(0);
    });

    it('protects an open checkout and still delivers when payment settles after unpublishing', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      const administrator = await actor(db);
      await archive(db, subject.volume.programId);

      await expect(deactivateProgramFile(subject.file.id, { reason: 'Archived' }, administrator.id))
        .rejects.toThrow('open checkout');
      await confirmCharge(subject.fixture);
      expect(await db.select().from(programAccess).where(eq(programAccess.orderItemId, subject.item.id)))
        .toMatchObject([{ status: 'active', source: 'purchase' }]);
      expect((await db.select().from(programFiles).where(eq(programFiles.id, subject.file.id)))[0])
        .toMatchObject({ uploadStatus: 'ready', isActive: true });
    });

    it('allows atomic replacement while preserving an entitlement', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      await confirmCharge(subject.fixture);
      const [replacement] = await db.insert(programFiles).values({
        programVolumeId: subject.volume.id,
        displayName: 'Replacement',
        r2Bucket: subject.file.r2Bucket,
        r2ObjectKey: `programs/${randomUUID()}.pdf`,
        sizeBytes: 101,
        uploadStatus: 'pending',
        isActive: true,
      }).returning();

      await db.transaction(async transaction => {
        await transaction.update(programFiles).set({ uploadStatus: 'ready', etag: randomUUID() }).where(eq(programFiles.id, replacement!.id));
        await transaction.update(programFiles).set({ isActive: false }).where(eq(programFiles.id, subject.file.id));
      });
      expect(await db.select({ id: programFiles.id, isActive: programFiles.isActive, uploadStatus: programFiles.uploadStatus })
        .from(programFiles).where(eq(programFiles.programVolumeId, subject.volume.id)))
        .toEqual(expect.arrayContaining([
          { id: subject.file.id, isActive: false, uploadStatus: 'ready' },
          { id: replacement!.id, isActive: true, uploadStatus: 'ready' },
        ]));
    });

    it('database trigger rejects bypass updates and deletes of the final owed file', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      await confirmCharge(subject.fixture);
      await expect(db.update(programFiles).set({ isActive: false }).where(eq(programFiles.id, subject.file.id)))
        .rejects.toMatchObject({ cause: { constraint_name: 'program_files_preserve_owed_delivery' } });
      await expect(db.delete(programFiles).where(eq(programFiles.id, subject.file.id)))
        .rejects.toMatchObject({ cause: { constraint_name: 'program_files_preserve_owed_delivery' } });
    });

    it('protects future grants but allows withdrawal after access expires with no open sale', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      const administrator = await actor(db);
      const startsAt = new Date(Date.now() + 60000);
      const expiresAt = new Date(Date.now() + 120000);
      const [grant] = await db.insert(programAccess).values({
        clientId: subject.item.clientId,
        programVolumeId: subject.volume.id,
        source: 'promotion',
        startsAt,
        expiresAt,
      }).returning();
      await expect(deactivateProgramFile(subject.file.id, {}, administrator.id)).rejects.toThrow('final active PDF owed');
      await db.update(programAccess).set({ status: 'expired' }).where(eq(programAccess.id, grant!.id));
      // Cancel the never-paid checkout so it no longer creates a delivery obligation.
      await db.update(payments).set({ status: 'abandoned' }).where(eq(payments.id, subject.fixture.paymentId));
      await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, subject.fixture.orderId));
      await expect(deactivateProgramFile(subject.file.id, { reason: 'No remaining obligation' }, administrator.id))
        .resolves.toMatchObject({ isActive: false });
    });

    it('allows an owed volume to retire one file when another ready file remains', async () => {
      const db = getDatabase();
      const subject = await purchasedVolume(db);
      const administrator = await actor(db);
      await confirmCharge(subject.fixture);
      await db.insert(programFiles).values({
        programVolumeId: subject.volume.id,
        displayName: 'Second file',
        r2Bucket: subject.file.r2Bucket,
        r2ObjectKey: `programs/${randomUUID()}.pdf`,
        sizeBytes: 100,
        uploadStatus: 'ready',
        etag: randomUUID(),
        isActive: true,
      });
      await expect(deactivateProgramFile(subject.file.id, { reason: 'Superseded' }, administrator.id))
        .resolves.toMatchObject({ isActive: false });
      expect(await db.select().from(programAuditEvents).where(eq(programAuditEvents.entityId, subject.file.id)))
        .toMatchObject([{ action: 'deactivated' }]);
    });
  });
}
