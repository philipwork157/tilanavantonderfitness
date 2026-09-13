import {
  adminProgramFileUploadFinalizeRequestSchema,
  adminProgramFileUploadRequestSchema,
  adminProgramFileUpdateRequestSchema,
  adminProgramMediaUploadRequestSchema,
  adminProgramMediaUpdateRequestSchema,
  adminProgramUpdateRequestSchema,
  CATALOGUE_IMAGE_MAX_BYTES,
  CATALOGUE_PDF_MAX_BYTES,
} from '@tilana/contracts/catalogue';
import { checkoutRequestSchema } from '@tilana/contracts/checkout';
import { adminClientCreateRequestSchema } from '@tilana/contracts/clients';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('catalogue API contracts', () => {
  it('rejects empty program patches and malformed slugs', () => {
    assert.equal(adminProgramUpdateRequestSchema.safeParse({}).success, false);
    assert.equal(adminProgramUpdateRequestSchema.safeParse({ slug: 'Not A Slug' }).success, false);
  });

  it('accepts only supported image types within the image limit', () => {
    const base = {
      filename: 'cover.webp',
      displayName: 'Program cover',
      altText: 'Woman exercising with a stability ball',
      sizeBytes: CATALOGUE_IMAGE_MAX_BYTES,
    };
    assert.equal(adminProgramMediaUploadRequestSchema.safeParse({ ...base, contentType: 'image/webp' }).success, true);
    assert.equal(adminProgramMediaUploadRequestSchema.safeParse({ ...base, contentType: 'image/svg+xml' }).success, false);
    assert.equal(adminProgramMediaUploadRequestSchema.safeParse({
      ...base,
      contentType: 'image/webp',
      sizeBytes: CATALOGUE_IMAGE_MAX_BYTES + 1,
    }).success, false);
  });

  it('accepts only PDFs within the private-file limit', () => {
    const base = {
      filename: 'program.pdf',
      displayName: 'Reconnect program',
      sizeBytes: CATALOGUE_PDF_MAX_BYTES,
    };
    assert.equal(adminProgramFileUploadRequestSchema.safeParse({ ...base, contentType: 'application/pdf' }).success, true);
    assert.equal(adminProgramFileUploadRequestSchema.safeParse({ ...base, contentType: 'text/plain' }).success, false);
    assert.equal(adminProgramFileUploadRequestSchema.safeParse({
      ...base,
      contentType: 'application/pdf',
      sizeBytes: CATALOGUE_PDF_MAX_BYTES + 1,
    }).success, false);
  });

  it('accepts an optional positive integer file replacement identifier', () => {
    assert.equal(adminProgramFileUploadFinalizeRequestSchema.safeParse({}).success, true);
    assert.equal(adminProgramFileUploadFinalizeRequestSchema.safeParse({ replaceFileId: 42 }).success, true);
    assert.equal(adminProgramFileUploadFinalizeRequestSchema.safeParse({ replaceFileId: 0 }).success, false);
    assert.equal(adminProgramFileUploadFinalizeRequestSchema.safeParse({ replaceFileId: '42' }).success, false);
    assert.equal(adminProgramFileUploadFinalizeRequestSchema.safeParse({ unexpected: true }).success, false);
  });

  it('requires at least one valid file or media metadata change', () => {
    assert.equal(adminProgramFileUpdateRequestSchema.safeParse({}).success, false);
    assert.equal(adminProgramFileUpdateRequestSchema.safeParse({ displayName: 'Workbook', sortOrder: 2 }).success, true);
    assert.equal(adminProgramMediaUpdateRequestSchema.safeParse({}).success, false);
    assert.equal(adminProgramMediaUpdateRequestSchema.safeParse({ altText: 'Woman exercising safely' }).success, true);
  });

  it('starts checkout with a database volume slug and rejects the removed static key field', () => {
    const request = {
      volumeSlug: 'reconnect-volume-2',
      expectedPriceCents: 39_900,
      firstName: 'Tilana',
      lastName: 'van Tonder',
      email: 'tilana@example.com',
      phone: '',
      consent: true,
      website: '',
      turnstileToken: '',
    };
    assert.equal(checkoutRequestSchema.safeParse(request).success, true);
    assert.equal(checkoutRequestSchema.safeParse({
      ...request,
      volumeSlug: undefined,
      programmeKey: 'reconnect-volume-1',
    }).success, false);
  });

  it('links manual client assignments to unique positive integer volume IDs', () => {
    const request = {
      firstName: 'Tilana',
      lastName: 'van Tonder',
      email: 'tilana@example.com',
      purchaseStatus: 'paid',
      programmes: [{ programVolumeId: 42, priceCents: 39_900 }],
    };
    assert.equal(adminClientCreateRequestSchema.safeParse(request).success, true);
    assert.equal(adminClientCreateRequestSchema.safeParse({
      ...request,
      programmes: [{ programVolumeId: 0, priceCents: 39_900 }],
    }).success, false);
    assert.equal(adminClientCreateRequestSchema.safeParse({
      ...request,
      programmes: [
        { programVolumeId: 42, priceCents: 39_900 },
        { programVolumeId: 42, priceCents: 45_000 },
      ],
    }).success, false);
  });
});
