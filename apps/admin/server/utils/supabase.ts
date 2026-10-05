import { createServerClient } from '@supabase/ssr';
import type { H3Event } from 'h3';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { hasAnyRole, type RoleKey } from '@tilana/db';
import { resolveAdminUser } from '../services/admin-users';

const requestClientKey = Symbol('supabase-request-client');
type ClientContext = H3Event['context'] & { [requestClientKey]?: ReturnType<typeof createServerClient> };

/**
 * One Supabase client per request, using httpOnly cookies only. The browser
 * never receives Supabase keys or tokens it can read from JavaScript.
 */
export function useSupabaseServerClient(event: H3Event) {
  const context = event.context as ClientContext;
  if (context[requestClientKey]) return context[requestClientKey];

  const config = useRuntimeConfig(event);
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw createError({ statusCode: 503, statusMessage: 'Sign-in is not configured yet.' });
  }

  const secure = getRequestURL(event).protocol === 'https:';
  const client = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: { httpOnly: true, path: '/', sameSite: 'lax', secure },
    cookies: {
      getAll: () => Object.entries(parseCookies(event)).map(([name, value]) => ({ name, value })),
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(event, name, value, { ...options, httpOnly: true, sameSite: 'lax', secure });
        }
        for (const [name, value] of Object.entries(headers ?? {})) {
          setResponseHeader(event, name, value);
        }
      },
    },
  });

  context[requestClientKey] = client;
  return client;
}

/**
 * Use in every admin API route. getUser() asks Supabase to verify the token
 * rather than trusting the cookie; the database then decides access.
 */
export async function requireAdmin(event: H3Event): Promise<AdminUser> {
  const { data, error } = await useSupabaseServerClient(event).auth.getUser();
  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Please sign in.' });
  }

  const admin = await resolveAdminUser(useDatabase(), data.user);
  if (!admin) {
    throw createError({ statusCode: 403, statusMessage: 'This account does not have admin access.' });
  }
  return admin;
}

/** For routes limited to specific roles, e.g. requireRole(event, ['admin']) for money. */
export async function requireRole(event: H3Event, allowed: readonly RoleKey[]): Promise<AdminUser> {
  const admin = await requireAdmin(event);
  if (!hasAnyRole(admin.roles, allowed)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do this.' });
  }
  return admin;
}

/**
 * Remove every Supabase auth cookie from this browser, including ones set
 * earlier in this same response (e.g. a sign-in that was then refused).
 */
export function clearSupabaseCookies(event: H3Event) {
  const names = new Set(Object.keys(parseCookies(event)).filter(name => name.startsWith('sb-')));
  const pending = getResponseHeader(event, 'set-cookie');
  for (const header of [pending ?? []].flat()) {
    const name = String(header).split('=')[0]?.trim();
    if (name?.startsWith('sb-')) names.add(name);
  }
  for (const name of names) deleteCookie(event, name, { path: '/' });
}

export function assertSameOrigin(event: H3Event) {
  if (!isSameOrigin(getHeader(event, 'origin'), getRequestHost(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is not allowed.' });
  }
}
