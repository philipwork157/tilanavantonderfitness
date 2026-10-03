import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { orderItems, orders, payments, programAccess, programAuditEvents, programFiles, programMedia, programs, programVolumes, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { deactivateProgramFile, finalizeProgramFileUpload, initiateProgramFileUpload } from '@server/services/program-storage';
import { inspectCatalogueObject, readUploadedProgramPdf } from '@server/utils/r2';
import { PDFDocument } from 'pdf-lib';
import { processPaystackEvent } from '@server/services/paystack';
import { seedPendingPayment } from './paystack-database';
import { listPublicCataloguePrograms } from '@server/services/public-catalogue';
import { getProgramPublicationChecklist, setProgramStatus, updateProgramVolume } from '@server/services/program-catalogue';
import { PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES } from '@tilana/contracts/catalogue';

/** Real trigger/service coverage for private files owed after catalogue withdrawal. */
export function registerProgramDeliveryCases(getDatabase: () => Database) {
  describe('verified latest PDF edition uploads', () => {
    beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => ({
      paystackSecretKey: 'sk_test_integration_fixture', paystackEnvironment: 'test',
      r2PrivateProgramBucket: 'private-test', r2PublicMediaBucket: 'public-test', r2PublicMediaBaseUrl: 'https://media.example.test',
    })));

    async function uploadFixture() {
      const db = getDatabase(); const subject = await purchasedVolume(db); const admin = await actor(db);
      const pdf = await PDFDocument.create(); pdf.addPage(); const content = await pdf.save();
      const input = { filename: 'new-edition.pdf', displayName: 'Latest edition', contentType: 'application/pdf' as const,
        sizeBytes: content.byteLength, sortOrder: 0 };
      return { db, subject, admin, content, input };
    }

    async function publishFixture(f: Awaited<ReturnType<typeof uploadFixture>>) {
      const suffix = randomUUID();
      await f.db.update(programs).set({ status: 'published', cardLabel: 'Program', headline: 'Beginner', description: 'Beginner guide', accent: 'sage' })
        .where(eq(programs.id, f.subject.volume.programId));
      await f.db.insert(programMedia).values({ programId: f.subject.volume.programId, displayName: 'Cover', altText: 'Cover', r2Bucket: 'public-test', r2ObjectKey: `${suffix}.png`, contentType: 'image/png', uploadStatus: 'ready' });
      await f.db.update(programVolumes).set({ slug: `published-${suffix}`, isPublished: true })
        .where(eq(programVolumes.id, f.subject.volume.id));
    }

    /** A real readable PDF padded with harmless whitespace, never a forged MIME-only fixture. */
    function paddedPdf(content: Uint8Array, size: number) {
      return Buffer.concat([content, Buffer.alloc(size - content.byteLength - 6, 0x20), Buffer.from('%%EOF\n')]);
    }

    it('keeps separate volumes for sale but hides a volume known to exceed the email budget', async () => {
      const f = await uploadFixture(); const suffix = randomUUID();
      await f.db.update(programs).set({ status: 'published', cardLabel: 'Program', headline: 'Beginner', description: 'Beginner guide', accent: 'sage' })
        .where(eq(programs.id, f.subject.volume.programId));
      await f.db.insert(programMedia).values({ programId: f.subject.volume.programId, displayName: 'Cover', altText: 'Cover', r2Bucket: 'public-test', r2ObjectKey: `${suffix}.png`, contentType: 'image/png', uploadStatus: 'ready' });
      await f.db.update(programVolumes).set({ slug: `volume-one-${suffix}`, isPublished: true }).where(eq(programVolumes.id, f.subject.volume.id));
      const [second] = await f.db.insert(programVolumes).values({ programId: f.subject.volume.programId, volumeNumber: 2,
        name: 'Volume 2', slug: `volume-two-${suffix}`, isPublished: true, currentPriceCents: 20000 }).returning();
      await f.db.insert(programFiles).values({ programVolumeId: second!.id, displayName: 'Volume 2 PDF', r2Bucket: 'private-test',
        r2ObjectKey: `second-${suffix}.pdf`, contentType: 'application/pdf', sizeBytes: 100, uploadStatus: 'ready' });
      const catalogue = (await listPublicCataloguePrograms()).find(program => program.id === f.subject.volume.programId);
      expect(catalogue?.volumes.map(volume => volume.isAvailable)).toEqual([true, true]);
      await f.db.update(programFiles).set({ sizeBytes: 16 * 1024 * 1024 }).where(eq(programFiles.id, f.subject.file.id));
      expect((await listPublicCataloguePrograms()).find(program => program.id === f.subject.volume.programId)?.volumes.map(volume => volume.isAvailable)).toEqual([false, true]);
    });

    it('validates and atomically replaces the previous edition without deleting its history or access', async () => {
      const f = await uploadFixture(); await confirmCharge(f.subject.fixture);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, f.input, f.admin.id);
      vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: f.content.byteLength, etag: '"edition-2"' });
      vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(f.content);
      await finalizeProgramFileUpload(upload.uploadId, f.admin.id, undefined, true);
      const files = await f.db.select().from(programFiles).where(eq(programFiles.programVolumeId, f.subject.volume.id));
      expect(files).toHaveLength(2);
      expect(files.find(file => file.id === f.subject.file.id)).toMatchObject({ isActive: false, uploadStatus: 'ready' });
      expect(files.find(file => file.id === upload.uploadId)).toMatchObject({ isActive: true, uploadStatus: 'ready', version: 2 });
      expect(await f.db.select().from(programAccess).where(eq(programAccess.orderItemId, f.subject.item.id))).toMatchObject([{ status: 'active' }]);
      expect(vi.mocked(readUploadedProgramPdf).mock.calls.at(-1)?.[4]).toBe('edition-2');
    });

    it('rejects an oversized latest edition without hiding the published product or retiring its old PDF', async () => {
      const f = await uploadFixture(); await publishFixture(f);
      const content = paddedPdf(f.content, PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES + 1);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, { ...f.input, sizeBytes: content.byteLength }, f.admin.id);
      vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: content.byteLength, etag: 'oversized' });
      vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(content);
      await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id, undefined, true))
        .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('15 MiB') });
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, f.subject.file.id)))[0])
        .toMatchObject({ uploadStatus: 'ready', isActive: true });
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, upload.uploadId)))[0]?.uploadStatus).toBe('pending');
      expect((await listPublicCataloguePrograms()).find(program => program.id === f.subject.volume.programId)?.volumes[0]?.isAvailable).toBe(true);
    });

    it('counts retained PDFs for additions but allows an individual replacement within the email budget', async () => {
      const f = await uploadFixture(); await publishFixture(f);
      await f.db.update(programFiles).set({ sizeBytes: 8 * 1024 * 1024 }).where(eq(programFiles.id, f.subject.file.id));
      const content = paddedPdf(f.content, 8 * 1024 * 1024);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, { ...f.input, sizeBytes: content.byteLength }, f.admin.id);
      for (const replaceFileId of [undefined, f.subject.file.id]) {
        vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: content.byteLength, etag: 'combined' });
        vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(content);
        if (replaceFileId === undefined) {
          await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id)).rejects.toMatchObject({ statusCode: 422 });
        } else {
          await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id, replaceFileId)).resolves.toMatchObject({ status: 'ready' });
        }
      }
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, f.subject.file.id)))[0]?.isActive).toBe(false);
      expect((await getProgramPublicationChecklist(f.subject.volume.programId))?.ready).toBe(true);
    });

    it('prevents a 31st published PDF while allowing a single-file replacement at the file-count limit', async () => {
      const f = await uploadFixture(); await publishFixture(f);
      await f.db.insert(programFiles).values(Array.from({ length: 29 }, (_, index) => ({
        programVolumeId: f.subject.volume.id, displayName: `Extra ${index}`, r2Bucket: 'private-test',
        r2ObjectKey: `${randomUUID()}.pdf`, contentType: 'application/pdf', sizeBytes: 100, uploadStatus: 'ready' as const,
      })));
      const upload = await initiateProgramFileUpload(f.subject.volume.id, f.input, f.admin.id);
      for (const replaceFileId of [undefined, f.subject.file.id]) {
        vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: f.content.byteLength, etag: 'limit' });
        vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(f.content);
        if (replaceFileId === undefined) {
          await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id)).rejects.toThrow('at most 30');
        } else {
          await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id, replaceFileId)).resolves.toMatchObject({ status: 'ready' });
        }
      }
    });

    it.each([null, PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES + 1])('keeps draft PDFs private and explains why size %s cannot publish', async sizeBytes => {
      const f = await uploadFixture();
      await f.db.update(programFiles).set({ sizeBytes }).where(eq(programFiles.id, f.subject.file.id));
      const suffix = randomUUID();
      await expect(updateProgramVolume(f.subject.volume.id, { slug: `draft-${suffix}`, isPublished: true }, f.admin.id))
        .rejects.toMatchObject({ issues: [{ code: 'volume_email_delivery_unavailable', volumeId: f.subject.volume.id }] });
      expect((await f.db.select().from(programVolumes).where(eq(programVolumes.id, f.subject.volume.id)))[0]?.isPublished).toBe(false);
    });

    it('marks unknown legacy file sizes unavailable and exposes the same problem in the publication checklist', async () => {
      const f = await uploadFixture(); await publishFixture(f);
      await f.db.update(programFiles).set({ sizeBytes: null }).where(eq(programFiles.id, f.subject.file.id));
      expect((await listPublicCataloguePrograms()).some(program => program.id === f.subject.volume.programId)).toBe(false);
      expect((await getProgramPublicationChecklist(f.subject.volume.programId))?.issues)
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'volume_email_delivery_unavailable', message: expect.stringContaining('verified file size') })]));
    });

    it('allows oversized archived private maintenance but prevents accidentally publishing it for new purchases', async () => {
      const f = await uploadFixture(); await publishFixture(f); await archive(f.db, f.subject.volume.programId);
      const content = paddedPdf(f.content, PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES + 1);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, { ...f.input, sizeBytes: content.byteLength }, f.admin.id);
      vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: content.byteLength, etag: 'archived' });
      vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(content);
      await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id, undefined, true)).resolves.toMatchObject({ status: 'ready' });
      await expect(setProgramStatus(f.subject.volume.programId, { status: 'published' }, f.admin.id))
        .rejects.toMatchObject({ issues: [{ code: 'volume_email_delivery_unavailable' }] });
      expect((await f.db.select().from(programs).where(eq(programs.id, f.subject.volume.programId)))[0]?.status).toBe('archived');
    });

    it('serializes unarchiving and replacing a private edition so an oversized published product cannot slip through', async () => {
      const f = await uploadFixture(); await publishFixture(f); await archive(f.db, f.subject.volume.programId);
      const content = paddedPdf(f.content, PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES + 1);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, { ...f.input, sizeBytes: content.byteLength }, f.admin.id);
      vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: content.byteLength, etag: 'race' });
      vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(content);
      const outcomes = await Promise.allSettled([
        finalizeProgramFileUpload(upload.uploadId, f.admin.id, undefined, true),
        setProgramStatus(f.subject.volume.programId, { status: 'published' }, f.admin.id),
      ]);
      expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
      const [program] = await f.db.select().from(programs).where(eq(programs.id, f.subject.volume.programId));
      if (program?.status === 'published') {
        expect((await getProgramPublicationChecklist(program.id))?.ready).toBe(true);
        expect((await f.db.select().from(programFiles).where(eq(programFiles.id, f.subject.file.id)))[0]?.isActive).toBe(true);
      } else {
        expect(program?.status).toBe('archived');
      }
    });

    it('never retires the old paid PDF when the new file is corrupt', async () => {
      const f = await uploadFixture(); await confirmCharge(f.subject.fixture);
      const upload = await initiateProgramFileUpload(f.subject.volume.id, f.input, f.admin.id);
      vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: f.content.byteLength, etag: 'invalid' });
      vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(Buffer.alloc(f.content.byteLength));
      await expect(finalizeProgramFileUpload(upload.uploadId, f.admin.id, undefined, true)).rejects.toMatchObject({ statusCode: 422 });
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, f.subject.file.id)))[0]?.isActive).toBe(true);
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, upload.uploadId)))[0]?.uploadStatus).toBe('failed');
    });

    it('serializes concurrent version reservations and rejects an older upload finishing last', async () => {
      const f = await uploadFixture();
      const uploads = await Promise.all([1, 2].map(() => initiateProgramFileUpload(f.subject.volume.id, f.input, f.admin.id)));
      const pending = (await f.db.select().from(programFiles).where(eq(programFiles.programVolumeId, f.subject.volume.id)))
        .filter(file => uploads.some(upload => upload.uploadId === file.id)).sort((a, b) => b.version - a.version);
      expect(pending.map(file => file.version)).toEqual([3, 2]);
      for (const file of pending) {
        vi.mocked(inspectCatalogueObject).mockResolvedValueOnce({ contentType: 'application/pdf', sizeBytes: f.content.byteLength, etag: `edition-${file.version}` });
        vi.mocked(readUploadedProgramPdf).mockResolvedValueOnce(f.content);
        if (file.version === 3) await finalizeProgramFileUpload(file.id, f.admin.id, undefined, true);
        else await expect(finalizeProgramFileUpload(file.id, f.admin.id, undefined, true)).rejects.toThrow('newer PDF edition');
      }
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, pending[0]!.id)))[0]?.isActive).toBe(true);
      expect((await f.db.select().from(programFiles).where(eq(programFiles.id, pending[1]!.id)))[0]?.uploadStatus).toBe('pending');
    });
  });
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
