import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { blogPostInputSchema, slugify } from '@tilana/contracts/blog';
import { publishProblems } from '../server/services/blog-posts';
import { ImageRejectedError, processCoverImage } from '../server/utils/image-processing';

describe('slugify', () => {
  it('makes clean web addresses from titles', () => {
    expect(slugify('When You Allow Comparison to Steal Your Worth')).toBe('when-you-allow-comparison-to-steal-your-worth');
    expect(slugify('  Welcome! A little about me…  ')).toBe('welcome-a-little-about-me');
    expect(slugify('Tilana’s Café & Crème')).toBe('tilanas-cafe-creme');
    expect(slugify('<script>')).toBe('script');
  });
});

describe('blogPostInputSchema', () => {
  const valid = {
    title: 'A title',
    slug: 'a-title',
    excerpt: 'A short summary of the post.',
    category: 'Nurturance',
    bodyMarkdown: 'Text',
    coverImageAlt: '',
    closingLine: ' ',
    quoteText: '',
    quoteCitation: '',
    publishedAt: null,
  };

  it('turns empty optional fields into null', () => {
    const parsed = blogPostInputSchema.parse(valid);
    expect(parsed.closingLine).toBeNull();
    expect(parsed.coverImageAlt).toBeNull();
  });

  it('rejects bad slugs and unknown categories', () => {
    expect(blogPostInputSchema.safeParse({ ...valid, slug: 'Bad Slug!' }).success).toBe(false);
    expect(blogPostInputSchema.safeParse({ ...valid, slug: '../admin' }).success).toBe(false);
    expect(blogPostInputSchema.safeParse({ ...valid, category: 'Gossip' }).success).toBe(false);
  });
});

describe('publishProblems', () => {
  const ready = { title: 'Title', excerpt: 'A short summary.', bodyMarkdown: 'x'.repeat(60), coverImagePath: null, coverImageAlt: null };

  it('is empty for a complete post', () => {
    expect(publishProblems(ready)).toEqual([]);
  });

  it('lists what is missing', () => {
    expect(publishProblems({ ...ready, excerpt: '', bodyMarkdown: '' })).toEqual(['Add a short summary.', 'Write the post.']);
    expect(publishProblems({ ...ready, coverImagePath: 'posts/1/a.webp', coverImageAlt: '' }))
      .toEqual(['Describe the cover photo for screen readers.']);
  });
});

describe('processCoverImage', () => {
  it('re-encodes a photo as WebP and keeps its size within 1600px', async () => {
    const png = await sharp({ create: { width: 2400, height: 3000, channels: 3, background: '#d5a27f' } }).png().toBuffer();
    const result = await processCoverImage(png);
    expect((await sharp(result.data).metadata()).format).toBe('webp');
    expect(result.width).toBe(1600);
    expect(result.height).toBe(2000);
  });

  it('rejects SVG and non-images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>');
    await expect(processCoverImage(svg)).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(processCoverImage(Buffer.from('<html><script>alert(1)</script></html>'))).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it('strips metadata such as location', async () => {
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } })
      .jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } }).toBuffer();
    const result = await processCoverImage(jpeg);
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  });
});
