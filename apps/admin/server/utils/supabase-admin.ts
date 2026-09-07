import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';

let adminClient: SupabaseClient | undefined;
let adminClientUrl = '';
let adminClientKey = '';

/** Server-only Supabase client for administrative Auth operations. */
export function getSupabaseAdminClient(event: H3Event): SupabaseClient {
  const config = useRuntimeConfig(event);
  const url = String(config.supabaseUrl || '').trim();
  const secretKey = String(config.supabaseServiceRoleKey || '').trim();

  if (!url || !secretKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Supabase administrative authentication is not configured.',
    });
  }

  if (!adminClient || adminClientUrl !== url || adminClientKey !== secretKey) {
    adminClient = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    adminClientUrl = url;
    adminClientKey = secretKey;
  }

  return adminClient;
}
