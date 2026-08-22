import { createServerClient } from '@supabase/ssr';
import type { H3Event } from 'h3';
import { getRequestURL, parseCookies, setCookie, setResponseHeader } from 'h3';

export function createSupabaseAuthClient(event: H3Event) {
  const config = useRuntimeConfig(event);

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Supabase authentication is not configured.',
    });
  }

  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: getRequestURL(event).protocol === 'https:',
    },
    cookies: {
      getAll() {
        return Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(event, name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: getRequestURL(event).protocol === 'https:',
          });
        }

        for (const [name, value] of Object.entries(headers)) {
          setResponseHeader(event, name, value);
        }
      },
    },
  });
}
