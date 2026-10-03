import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { Database } from '@tilana/db/server';
import { orderItemFiles, orderItems, programFiles, programs, programVolumes } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { initializePaystackBasketCheckout, processPaystackEvent } from '@server/services/paystack';
import { getPurchaseProgramAttachments } from '@server/services/purchase-program-attachments';
import { readProgramEmailAttachment } from '@server/utils/r2';
import { createBarrier } from './paystack-database';

/** Real snapshot foreign keys and lifecycle; all PDF/provider reads remain simulated. */
export function registerPurchaseEditionCases(getDatabase: () => Database) {
  const config = { paystackSecretKey: 'sk_test_fixture', paystackEnvironment: 'test',
    accountBaseUrl: 'https://admin.example.test', public: { siteUrl: 'https://website.example.test' },
    r2PublicMediaBucket: 'test-public', r2PublicMediaBaseUrl: 'https://media.example.test', r2PrivateProgramBucket: 'test-private',
    customerNotificationsEnabled: true, paystackRecoveryEnabled: true, paystackRecoveryToken: 'fixture-'.repeat(5),
    paystackRecoveryAlertTo: 'owner@example.test', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' };

  async function fixture() {
    const database = getDatabase(); const suffix = randomUUID();
    const document = await PDFDocument.create(); document.addPage(); const content = await document.save();
    const [program] = await database.insert(programs).values({ slug: `edition-${suffix}`, name: 'Beginner', status: 'published' }).returning();
    const [volume] = await database.insert(programVolumes).values({ programId: program!.id, name: 'Volume 1',
      slug: `edition-volume-${suffix}`, volumeNumber: 1, isPublished: true, currentPriceCents: 10000 }).returning();
    const [file] = await database.insert(programFiles).values({ programVolumeId: volume!.id, displayName: 'Original program',
      originalFilename: 'Original.pdf', r2Bucket: 'test-private', r2ObjectKey: `edition-${suffix}.pdf`,
      uploadStatus: 'ready', sizeBytes: content.byteLength, etag: `edition-${suffix}` }).returning();
    const input = { idempotencyKey: randomUUID(), items: [{ volumeSlug: volume!.slug!, expectedPriceCents: 10000 }],
      firstName: 'Test', lastName: 'Buyer', email: `${suffix}@example.test`, phone: '', consent: true, website: '', turnstileToken: '' };
    const fetch = vi.fn().mockImplementation((_url: string, options: { body: { reference: string } }) => ({
      status: true, data: { reference: options.body.reference, access_code: 'fixture', authorization_url: 'https://checkout.paystack.com/fixture' },
    }));
    vi.stubGlobal('$fetch', fetch);
    return { database, volume: volume!, file: file!, content, input, fetch };
  }

  describe('checkout-pinned PDF editions', () => {
    beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => config));

    it('emails the verified purchased PDF after a larger latest edition replaces it', async () => {
      const f = await fixture();
      vi.mocked(readProgramEmailAttachment).mockResolvedValueOnce(f.content);
      const checkout = await initializePaystackBasketCheckout(f.input);
      const [pin] = await f.database.select().from(orderItemFiles).where(eq(orderItemFiles.programFileId, f.file.id));
      expect(pin).toMatchObject({ programFileId: f.file.id, sizeBytes: f.content.byteLength,
        contentSha256: createHash('sha256').update(f.content).digest('hex') });
      await f.database.insert(programFiles).values({ programVolumeId: f.volume.id, displayName: 'New larger edition',
        r2Bucket: f.file.r2Bucket, r2ObjectKey: `${f.file.r2ObjectKey}-new`, uploadStatus: 'ready', sizeBytes: 16 * 1024 * 1024, version: 2 });
      await f.database.update(programFiles).set({ isActive: false }).where(eq(programFiles.id, f.file.id));
      // Keep delivery deferred to inspect the exact attachment without sending a provider email.
      vi.stubGlobal('useRuntimeConfig', () => ({ ...config, customerNotificationsEnabled: false }));
      await processPaystackEvent({ event: 'charge.success', data: { id: `charge-${checkout.reference}`,
        reference: checkout.reference, amount: 10000, currency: 'ZAR', domain: 'test', status: 'success' } }, `edition-${checkout.reference}`);
      const [item] = await f.database.select().from(orderItems).where(eq(orderItems.id, pin!.orderItemId));
      vi.mocked(readProgramEmailAttachment).mockResolvedValueOnce(f.content);
      const attachments = await getPurchaseProgramAttachments(item!.orderId, item!.clientId, new AbortController().signal);
      expect(attachments).toHaveLength(1);
      expect(attachments![0]!.filename).toContain('Original.pdf');
      expect(vi.mocked(readProgramEmailAttachment).mock.calls.at(-1)?.[1]).toBe(f.file.r2ObjectKey);
    });

    it('does not contact Paystack if the edition changes while its PDF is being verified', async () => {
      const f = await fixture(); const started = createBarrier(); const release = createBarrier();
      vi.mocked(readProgramEmailAttachment).mockImplementationOnce(async () => { started.resolve(); await release.promise; return f.content; });
      const checkout = initializePaystackBasketCheckout(f.input);
      const rejected = expect(checkout).rejects.toMatchObject({ statusCode: 503 });
      await started.promise;
      await f.database.insert(programFiles).values({ programVolumeId: f.volume.id, displayName: 'Replacement',
        r2Bucket: f.file.r2Bucket, r2ObjectKey: `${f.file.r2ObjectKey}-replacement`, uploadStatus: 'ready', sizeBytes: f.content.byteLength, version: 2 });
      await f.database.update(programFiles).set({ isActive: false }).where(eq(programFiles.id, f.file.id));
      release.resolve(); await rejected;
      expect(f.fetch).not.toHaveBeenCalled();
      expect(await f.database.select().from(orderItemFiles).where(eq(orderItemFiles.programFileId, f.file.id))).toHaveLength(0);
    });

    it('enforces same-owner/same-volume pins and preserves immutable editions', async () => {
      const f = await fixture(); vi.mocked(readProgramEmailAttachment).mockResolvedValueOnce(f.content);
      await initializePaystackBasketCheckout(f.input);
      const [pin] = await f.database.select().from(orderItemFiles).where(eq(orderItemFiles.programFileId, f.file.id));
      const other = await fixture();
      await expect(f.database.insert(orderItemFiles).values({ orderItemId: pin!.orderItemId, clientId: pin!.clientId,
        programVolumeId: pin!.programVolumeId, programFileId: other.file.id, sizeBytes: f.content.byteLength,
        contentSha256: pin!.contentSha256 })).rejects.toMatchObject({ cause: { constraint_name: 'order_item_files_edition_fk' } });
      await expect(f.database.insert(orderItemFiles).values({ orderItemId: pin!.orderItemId, clientId: pin!.clientId + 999999,
        programVolumeId: pin!.programVolumeId, programFileId: pin!.programFileId, sizeBytes: f.content.byteLength,
        contentSha256: pin!.contentSha256 })).rejects.toThrow();
      await expect(f.database.update(orderItemFiles).set({ contentSha256: '0'.repeat(64) }).where(eq(orderItemFiles.id, pin!.id)))
        .rejects.toMatchObject({ cause: { constraint_name: 'order_item_files_immutable' } });
      await expect(f.database.delete(orderItemFiles).where(eq(orderItemFiles.id, pin!.id)))
        .rejects.toMatchObject({ cause: { constraint_name: 'order_item_files_immutable' } });
      await expect(f.database.update(programFiles).set({ r2ObjectKey: 'different.pdf' }).where(eq(programFiles.id, f.file.id)))
        .rejects.toMatchObject({ cause: { constraint_name: 'program_files_purchase_snapshot_immutable' } });
    });
  });
}
