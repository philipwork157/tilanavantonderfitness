import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const secure = process.env.NODE_ENV === 'production';
const cookieDefaults = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };

/**
 * Runs before every page: refreshes the Supabase session cookies and sends
 * signed-out visitors to /login. This is only a fast first check; the
 * dashboard layout and every API route still verify the admin themselves.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const isLogin = request.nextUrl.pathname === '/login';
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookieOptions: cookieDefaults,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, { ...options, ...cookieDefaults });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && !isLogin) {
    const login = new URL('/login', request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== '/') login.searchParams.set('next', next);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Pages only: API routes answer 401 themselves, static files need no session.
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)'],
};
