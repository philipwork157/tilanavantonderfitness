import { describe, expect, it } from 'vitest';
import type { PublicProgram } from '@tilana/contracts/public-programs';
import { toSiteProgram } from '@web/site/programs';
import { faqStructuredData, programsStructuredData } from '@web/site/structured-data';
import { canonicalPath, newest, sitemapResponse } from '@web/utils/sitemap';

const base = new URL('https://tilanavantonder.co.za');

function program(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    slug: 'beginner-volume-1',
    name: 'Beginner',
    title: 'Build a confident foundation.',
    summary: 'A welcoming introduction to strength.',
    description: 'Longer description.',
    audience: 'New or returning',
    tags: ['Strength'],
    tone: 'terracotta',
    illustration: 'barbell',
    series: 'strength',
    step: 1,
    marker: 'Start here',
    volumeNumber: 1,
    priceCents: 39900,
    currency: 'ZAR',
    ...overrides,
  };
}

describe('sitemaps for the pages rendered on request', () => {
  it('lists full addresses with their last change, and escapes them', async () => {
    const response = sitemapResponse([
      { path: '/' },
      { path: '/kitchen/oats&berries', lastmod: new Date('2026-10-01T08:00:00Z') },
    ], base);
    const xml = await response.text();
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<url><loc>https://tilanavantonder.co.za/</loc></url>');
    expect(xml).toContain('<loc>https://tilanavantonder.co.za/kitchen/oats&amp;berries</loc><lastmod>2026-10-01T08:00:00.000Z</lastmod>');
  });

  it('gives every page one address, without .html or a trailing slash', () => {
    expect(canonicalPath('/about.html')).toBe('/about');
    expect(canonicalPath('/about/')).toBe('/about');
    expect(canonicalPath('/checkout/complete.html')).toBe('/checkout/complete');
    expect(canonicalPath('/index.html')).toBe('/');
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('/blog/when-life-gets-in-the-way')).toBe('/blog/when-life-gets-in-the-way');
  });

  it('dates a listing page by its newest item', () => {
    expect(newest([new Date('2026-01-01'), new Date('2026-03-01'), new Date('2026-02-01')])?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(newest([])).toBeUndefined();
  });
});

describe('structured data for the programs page', () => {
  it('describes each program as a product with its price in rand', () => {
    const data = programsStructuredData([toSiteProgram(program())], 'https://tilanavantonder.co.za/program', 'https://tilanavantonder.co.za/#person', 'https://tilanavantonder.co.za/og.png');
    const item = data.itemListElement[0]!.item;
    expect(item.name).toBe('Beginner');
    expect(item.url).toBe('https://tilanavantonder.co.za/program#beginner-volume-1');
    expect(item.image).toBe('https://tilanavantonder.co.za/og.png');
    expect(item.offers).toMatchObject({ price: '399.00', priceCurrency: 'ZAR', availability: 'https://schema.org/InStock' });
  });

  it('uses the sharp PDF cover as the product picture when there is one', () => {
    const preview = { pageCount: 4, pages: [{ url: 'https://media.test/cover.webp', page: 1, width: 600, height: 800, blurred: false }] };
    const data = programsStructuredData([toSiteProgram(program({ preview }))], 'https://x.test/program', 'https://x.test/#person', 'https://x.test/og.png');
    expect(data.itemListElement[0]!.item.image).toBe('https://media.test/cover.webp');
  });

  it('turns the FAQs into questions and answers', () => {
    const data = faqStructuredData([{ q: 'Is this a subscription?', a: 'No.' }], 'https://x.test/program');
    expect(data.mainEntity).toEqual([{ '@type': 'Question', name: 'Is this a subscription?', acceptedAnswer: { '@type': 'Answer', text: 'No.' } }]);
  });
});
