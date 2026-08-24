import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Private bucket holding client progress photos (health data). */
export const CLIENT_PHOTO_BUCKET = 'client-photos';

let storageClient: SupabaseClient | undefined;

function getStorageClient(): SupabaseClient {
  if (storageClient) return storageClient;

  const { supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Photo storage is not configured.',
    });
  }

  storageClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return storageClient;
}

export async function uploadClientPhoto(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const supabase = getStorageClient();
  const { error } = await supabase.storage
    .from(CLIENT_PHOTO_BUCKET)
    .upload(path, body, { contentType, upsert: false });

  if (error) {
    throw createError({ statusCode: 502, statusMessage: `Photo upload failed: ${error.message}` });
  }
}

/** Short-lived signed URL so the private photo can be shown in the admin. */
export async function createSignedPhotoUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage
    .from(CLIENT_PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeClientPhoto(path: string): Promise<void> {
  const supabase = getStorageClient();
  await supabase.storage.from(CLIENT_PHOTO_BUCKET).remove([path]);
}
