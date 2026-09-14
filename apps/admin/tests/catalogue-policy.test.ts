import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildProgramFileObjectKey,
  buildProgramMediaObjectKey,
  CatalogueStorageVerificationError,
  getCataloguePublicationIssues,
  getProgramFileReplacementIssue,
  getProgramVolumeAuditEvents,
  isCheckoutPriceCurrent,
  publicObjectUrl,
  requiresPurchasedVolumeSlugRedirect,
  verifyUploadedObject,
} from '../server/services/catalogue-policy.ts';

describe('catalogue publication policy', () => {
  it('explains every requirement missing from an incomplete program', () => {
    const issues = getCataloguePublicationIssues({
      cardLabel: null,
      headline: null,
      description: null,
      accent: null,
      hasReadyCover: false,
      volumes: [],
    });

    assert.deepEqual(issues.map(issue => issue.code), [
      'missing_card_label',
      'missing_headline',
      'missing_description',
      'missing_accent',
      'missing_cover',
      'missing_published_volume',
    ]);
  });

  it('accepts a complete program with a sellable integer-keyed volume', () => {
    assert.deepEqual(getCataloguePublicationIssues({
      cardLabel: 'Reconnect',
      headline: 'Reconnect with your body',
      description: 'A guided program.',
      accent: 'peach',
      hasReadyCover: true,
      volumes: [{
        id: 18,
        slug: 'reconnect-volume-1',
        name: 'Reconnect · Volume 1',
        isPublished: true,
        priceCents: 39_900,
        currency: 'ZAR',
        hasReadyFile: true,
      }],
    }), []);
  });
});

describe('catalogue checkout price policy', () => {
  it('accepts the current database price and rejects a stale browser price', () => {
    assert.equal(isCheckoutPriceCurrent(39_900, 39_900), true);
    assert.equal(isCheckoutPriceCurrent(39_900, 44_900), false);
  });
});

describe('catalogue checkout slug policy', () => {
  it('allows a purchased legacy volume to receive its first checkout slug', () => {
    assert.equal(requiresPurchasedVolumeSlugRedirect(null, 'beginner-volume-1', true), false);
  });

  it('requires redirects before changing or removing an established purchased slug', () => {
    assert.equal(
      requiresPurchasedVolumeSlugRedirect('beginner-volume-1', 'beginner-volume-one', true),
      true,
    );
    assert.equal(requiresPurchasedVolumeSlugRedirect('beginner-volume-1', null, true), true);
    assert.equal(
      requiresPurchasedVolumeSlugRedirect('beginner-volume-1', 'beginner-volume-one', false),
      false,
    );
  });
});

describe('catalogue object policy', () => {
  it('builds versioned keys from integer IDs without preserving an unsafe path', () => {
    assert.equal(
      buildProgramMediaObjectKey(12, 31, 2, '../../Reconnect Cover.PNG', 'image/webp'),
      'programs/12/media/31/v2-reconnect-cover.webp',
    );
    assert.equal(
      buildProgramFileObjectKey(12, 18, 44, 1, 'C:\\Users\\Tilana\\Reconnect Pelvic Floor.PDF'),
      'programs/12/volumes/18/files/44/v1-reconnect-pelvic-floor.pdf',
    );
  });

  it('encodes public object paths and requires an HTTPS media domain', () => {
    assert.equal(
      publicObjectUrl('https://media.example.com/', 'programs/1/a cover.webp'),
      'https://media.example.com/programs/1/a%20cover.webp',
    );
    assert.throws(() => publicObjectUrl('http://media.example.com', 'cover.webp'), /must use HTTPS/);
  });

  it('rejects R2 metadata that differs from the reserved upload', () => {
    assert.throws(() => verifyUploadedObject(
      { contentType: 'application/pdf', sizeBytes: 100 },
      { contentType: 'image/png', sizeBytes: 100 },
    ), CatalogueStorageVerificationError);
    assert.throws(() => verifyUploadedObject(
      { contentType: 'application/pdf', sizeBytes: 100 },
      { contentType: 'application/pdf', sizeBytes: 99 },
    ), /size does not match/);
  });

  it('normalizes a verified R2 ETag', () => {
    assert.deepEqual(verifyUploadedObject(
      { contentType: 'application/pdf', sizeBytes: 100 },
      { contentType: 'application/pdf; charset=binary', sizeBytes: 100, etag: '"abc123"' },
    ), { etag: 'abc123' });
  });
});

describe('catalogue file replacement policy', () => {
  const file = { id: 22, programVolumeId: 7 };

  it('only accepts a different ready, active file from the same volume', () => {
    assert.equal(getProgramFileReplacementIssue(file, {
      id: 21,
      programVolumeId: 7,
      uploadStatus: 'ready',
      isActive: true,
    }), null);
    assert.equal(getProgramFileReplacementIssue(file, null), 'not_found');
    assert.equal(getProgramFileReplacementIssue(file, {
      id: 22,
      programVolumeId: 7,
      uploadStatus: 'pending',
      isActive: true,
    }), 'same_file');
    assert.equal(getProgramFileReplacementIssue(file, {
      id: 21,
      programVolumeId: 8,
      uploadStatus: 'ready',
      isActive: true,
    }), 'different_volume');
    assert.equal(getProgramFileReplacementIssue(file, {
      id: 21,
      programVolumeId: 7,
      uploadStatus: 'ready',
      isActive: false,
    }), 'not_active_ready');
  });
});

describe('catalogue volume audit policy', () => {
  it('records price, publication, and ordinary edits as distinct events', () => {
    assert.deepEqual(getProgramVolumeAuditEvents(
      { currentPriceCents: 39_900, currency: 'ZAR', isPublished: false },
      { currentPriceCents: 44_900, currency: 'ZAR', isPublished: true },
      { currentPriceCents: 44_900, isPublished: true, name: 'Reconnect · Volume 1' },
    ), [
      {
        action: 'price_changed',
        changeSummary: {
          previousPriceCents: 39_900,
          priceCents: 44_900,
          previousCurrency: 'ZAR',
          currency: 'ZAR',
        },
      },
      {
        action: 'published',
        changeSummary: { previousIsPublished: false, isPublished: true },
      },
      {
        action: 'updated',
        changeSummary: { fields: ['name'] },
      },
    ]);
  });

  it('records an unchanged special-field request as an ordinary update', () => {
    assert.deepEqual(getProgramVolumeAuditEvents(
      { currentPriceCents: 39_900, currency: 'ZAR', isPublished: false },
      { currentPriceCents: 39_900, currency: 'ZAR', isPublished: false },
      { currentPriceCents: 39_900 },
    ), [{ action: 'updated', changeSummary: { fields: ['currentPriceCents'] } }]);
  });
});
