import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverConfig } from '../config';
import { HttpError } from '../http';

let client: SupabaseClient | undefined;

/** Server-only Supabase client with the service role key (never sent to browsers). */
export function storageClient(): SupabaseClient {
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

/** The public URL of a file in a public Supabase Storage bucket. */
export function publicStorageUrl(bucket: string, path: string): string {
  const { supabaseUrl } = serverConfig();
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}
