import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverConfig } from '../config';
import { HttpError } from '../http';

const secure = process.env.NODE_ENV === 'production';
const cookieDefaults = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };

/**
 * Supabase client for route handlers and server components, using httpOnly
 * cookies only. The browser never receives Supabase keys or tokens it can
 * read from JavaScript. Server components cannot set cookies, so writes there
 * are skipped; proxy.ts keeps the session fresh instead.
 */
export async function createSupabaseServerClient() {
  const { supabaseUrl: url, supabasePublishableKey: key } = serverConfig();
  if (!url || !key) throw new HttpError(503, 'Sign-in is not configured yet.');
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: cookieDefaults,
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, { ...options, ...cookieDefaults });
        } catch {
          // Called from a server component: nothing to do.
        }
      },
    },
  });
}

/** Remove every Supabase auth cookie from this browser (e.g. a sign-in that was then refused). */
export async function clearSupabaseCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name.startsWith('sb-')) store.delete({ name, path: '/' });
  }
}
