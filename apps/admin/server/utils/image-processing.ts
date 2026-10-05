import sharp from 'sharp';

/** Pure image handling (no Nuxt imports) so it can be unit tested. */

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ImageRejectedError extends Error {}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Re-encode every upload as WebP (max 1600px wide). Only real JPEG/PNG/WebP
 * pixels survive: metadata (such as GPS location) is stripped and anything
 * that is not a photo, like SVG or HTML disguised as an image, is rejected.
 */
export async function processCoverImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  }
  catch {
    format = undefined;
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ImageRejectedError('Please upload a JPG, PNG or WebP photo.');
  }

  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
