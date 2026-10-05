import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProcessedImage } from './image-processing';

const BUCKET = 'blog-images';
export const MAX_COVER_UPLOAD_BYTES = 10 * 1024 * 1024;

let client: SupabaseClient | undefined;
let bucketReady = false;

/** Server-only Supabase client with the service role key (never sent to browsers). */
function storageClient(): SupabaseClient {
  if (client) return client;
  const { supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw createError({ statusCode: 503, statusMessage: 'Image uploads are not configured yet.' });
  }
  client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

async function ensureBucket(storage: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await storage.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '5MB',
      allowedMimeTypes: ['image/webp'],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

export function blogImagePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { supabaseUrl } = useRuntimeConfig();
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
    throw createError({ statusCode: 502, statusMessage: 'The image could not be stored. Please try again.' });
  }
  return path;
}

/** Best effort: a leftover file is harmless, so failures are only logged. */
export async function deleteBlogImage(path: string | null | undefined) {
  if (!path) return;
  const { error } = await storageClient().storage.from(BUCKET).remove([path]);
  if (error) console.warn('Could not delete blog image', path, error.message);
}
