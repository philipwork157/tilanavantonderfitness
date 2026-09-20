import { createServerClient } from '@supabase/ssr';
import type { H3Event } from 'h3';
import { getRequestURL, parseCookies, setCookie, setResponseHeader } from 'h3';

const requestAuthClient = Symbol('request-auth-client');
type AuthContext = H3Event['context'] & { [requestAuthClient]?: ReturnType<typeof createServerClient> };

/** Keep OTP verification and account linking on the same request-local session.
 * Response cookies are not present in the incoming request; recreating the
 * client during the callback would lose the just-verified session.
 */
export function createSupabaseAuthClient(event: H3Event) {
  const context = event.context as AuthContext;
  if (context[requestAuthClient]) return context[requestAuthClient];
  const config = useRuntimeConfig(event);

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Supabase authentication is not configured.',
    });
  }

  const client = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
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
  context[requestAuthClient] = client;
  return client;
}
