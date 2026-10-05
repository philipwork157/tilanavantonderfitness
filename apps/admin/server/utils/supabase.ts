import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { isAllowedAdmin, parseAdminEmails } from './admin-access';

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

export function getAdminAllowList(event: H3Event) {
  const allowList = parseAdminEmails(useRuntimeConfig(event).adminEmails);
  if (!allowList.size) {
    throw createError({ statusCode: 503, statusMessage: 'Admin access is not configured yet.' });
  }
  return allowList;
}

export function toAdminUser(user: User): AdminUser {
  return { id: user.id, email: user.email ?? '' };
}

/**
 * Use in every admin API route. getUser() asks Supabase to verify the token
 * rather than trusting the cookie contents.
 */
export async function requireAdmin(event: H3Event): Promise<AdminUser> {
  const allowList = getAdminAllowList(event);
  const { data, error } = await useSupabaseServerClient(event).auth.getUser();

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Please sign in.' });
  }
  if (!isAllowedAdmin(data.user, allowList)) {
    throw createError({ statusCode: 403, statusMessage: 'This account does not have admin access.' });
  }
  return toAdminUser(data.user);
}

export function assertSameOrigin(event: H3Event) {
  if (!isSameOrigin(getHeader(event, 'origin'), getRequestHost(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is not allowed.' });
  }
}
