import 'server-only';
import { randomUUID } from 'node:crypto';
import { emailImageFromCover, type ProcessedImage } from './image-processing';
import { deleteMedia, getMedia, hasMedia, mediaUrl, putMedia } from './media-storage';

/*
 * Blog covers and Kitchen recipe photos, in the public R2 bucket
 * (media-storage.ts): blog/<id>/<uuid>.webp and kitchen/<id>/<uuid>.webp.
 */

export const MAX_COVER_UPLOAD_BYTES = 10 * 1024 * 1024;

export function blogImagePublicUrl(path: string | null | undefined): string | null {
  return mediaUrl(path);
}

export async function uploadBlogImage(postId: number, image: ProcessedImage): Promise<string> {
  return uploadWebsiteImage(`blog/${postId}`, image);
}

/** Kitchen recipe photos live next to the blog covers, under kitchen/. */
export async function uploadRecipeImage(recipeId: number, image: ProcessedImage): Promise<string> {
  return uploadWebsiteImage(`kitchen/${recipeId}`, image);
}

async function uploadWebsiteImage(folder: string, image: ProcessedImage): Promise<string> {
  const path = `${folder}/${randomUUID()}.webp`;
  await putMedia(path, image.data, 'image/webp');
  return path;
}

/** Removes a cover or photo, and its email copy if one was made. Best effort. */
export async function deleteBlogImage(path: string | null | undefined) {
  if (!path) return;
  await deleteMedia([path, emailImagePath(path)]);
}

/** Where the JPEG email copy of a cover lives: email/blog/12/<uuid>.jpg. */
export const emailImagePath = (coverPath: string) => `email/${coverPath.replace(/\.webp$/i, '')}.jpg`;

/**
 * Public URL of a JPEG copy of a cover photo for emails (many email apps do
 * not show WebP), made once and kept under email/. Null when there is no cover.
 */
export async function ensureEmailImage(coverPath: string | null | undefined): Promise<string | null> {
  if (!coverPath) return null;
  const emailPath = emailImagePath(coverPath);
  if (!await hasMedia(emailPath)) {
    const source = await getMedia(coverPath);
    if (!source) throw new Error('The cover photo could not be read for the email.');
    await putMedia(emailPath, await emailImageFromCover(source), 'image/jpeg');
  }
  return mediaUrl(emailPath);
}
