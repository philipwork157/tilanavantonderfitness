import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  catalogueErrorMessage,
  formatCatalogueFileSize,
  normaliseCatalogueAccent,
  shouldMoveIncompleteProgramToDraft,
  slugifyCatalogueValue,
} from '../app/utils/catalogue.ts';

describe('catalogue UI helpers', () => {
  it('creates stable catalogue slugs from human names', () => {
    assert.equal(slugifyCatalogueValue('  Reconnect: Pelvic Floor — Volume 1  '), 'reconnect-pelvic-floor-volume-1');
    assert.equal(slugifyCatalogueValue('Nourish & Move'), 'nourish-move');
  });

  it('surfaces publication issues before generic request errors', () => {
    assert.equal(catalogueErrorMessage({
      data: {
        statusMessage: 'The program is not ready to publish.',
        data: { issues: [{ message: 'Upload and finalize a program cover image.' }] },
      },
    }, 'Fallback'), 'Upload and finalize a program cover image.');
    assert.equal(catalogueErrorMessage(null, 'Fallback'), 'Fallback');
  });

  it('formats customer-facing file sizes compactly', () => {
    assert.equal(formatCatalogueFileSize(null), 'Size unavailable');
    assert.equal(formatCatalogueFileSize(2_048), '2 KB');
    assert.equal(formatCatalogueFileSize(5 * 1_024 * 1_024), '5.0 MB');
  });

  it('keeps legacy program accents compatible with generic colour themes', () => {
    assert.equal(normaliseCatalogueAccent('nourish'), 'sage');
    assert.equal(normaliseCatalogueAccent('advanced'), 'caramel');
    assert.equal(normaliseCatalogueAccent('reconnect'), 'terracotta');
    assert.equal(normaliseCatalogueAccent('sage'), 'sage');
    assert.equal(normaliseCatalogueAccent(null), 'terracotta');
  });

  it('moves only known incomplete published programs back to draft before editing', () => {
    assert.equal(shouldMoveIncompleteProgramToDraft('published', false), true);
    assert.equal(shouldMoveIncompleteProgramToDraft('published', true), false);
    assert.equal(shouldMoveIncompleteProgramToDraft('published', undefined), false);
    assert.equal(shouldMoveIncompleteProgramToDraft('draft', false), false);
    assert.equal(shouldMoveIncompleteProgramToDraft('archived', false), false);
  });
});
