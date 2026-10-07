import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emailImageFromCover, type ProcessedImage } from './image-processing';
import { serverConfig } from '../config';
import { HttpError } from '../http';

const BUCKET = 'blog-images';
export const MAX_COVER_UPLOAD_BYTES = 10 * 1024 * 1024;

let client: SupabaseClient | undefined;
let bucketReady = false;

/** Server-only Supabase client with the service role key (never sent to browsers). */
function storageClient(): SupabaseClient {
  if (client) return client;
  const { supabaseUrl, supabaseServiceRoleKey } = serverConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new HttpError(503, 'Image uploads are not configured yet.');
  }
  client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const ALLOWED_TYPES = ['image/webp', 'image/jpeg'];

async function ensureBucket(storage: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await storage.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '5MB',
      allowedMimeTypes: ALLOWED_TYPES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  else if (!ALLOWED_TYPES.every(type => data.allowed_mime_types?.includes(type))) {
    // Buckets made before newsletter emails only allowed WebP.
    const { error } = await storage.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: '5MB',
      allowedMimeTypes: ALLOWED_TYPES,
    });
    if (error) throw error;
  }
  bucketReady = true;
}

export function blogImagePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { supabaseUrl } = serverConfig();
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

export async function uploadBlogImage(postId: number, image: ProcessedImage): Promise<string> {
  const storage = storageClient();
  await ensureBucket(storage);
  const path = `posts/${postId}/${randomUUID()}.webp`;
  const { error } = await storage.storage.from(BUCKET).upload(path, image.data, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    throw new HttpError(502, 'The image could not be stored. Please try again.');
  }
  return path;
}

/** Best effort: a leftover file is harmless, so failures are only logged. */
export async function deleteBlogImage(path: string | null | undefined) {
  if (!path) return;
  const { error } = await storageClient().storage.from(BUCKET).remove([path]);
  if (error) console.warn('Could not delete blog image', path, error.message);
}

/**
 * Public URL of a JPEG copy of a cover photo for emails, made once and kept
 * next to it under email/. Returns null when there is no cover.
 */
export async function ensureEmailImage(coverPath: string | null | undefined): Promise<string | null> {
  if (!coverPath) return null;
  const emailPath = `email/${coverPath.replace(/\.webp$/i, '')}.jpg`;
  const storage = storageClient();
  await ensureBucket(storage);
  const bucket = storage.storage.from(BUCKET);

  const { data: existing } = await bucket.list(emailPath.slice(0, emailPath.lastIndexOf('/')), {
    search: emailPath.slice(emailPath.lastIndexOf('/') + 1),
  });
  if (!existing?.some(file => emailPath.endsWith(file.name))) {
    const { data: source, error: downloadError } = await bucket.download(coverPath);
    if (downloadError || !source) throw new Error('The cover photo could not be read for the email.');
    const jpeg = await emailImageFromCover(Buffer.from(await source.arrayBuffer()));
    const { error } = await bucket.upload(emailPath, jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
    if (error) throw new Error('The email copy of the cover photo could not be stored.');
  }
  return blogImagePublicUrl(emailPath);
}
