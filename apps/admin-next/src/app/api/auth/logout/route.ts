import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/server/auth/admin-access';
import { handle, sameOriginOnly } from '@/server/http';
import { clearSupabaseCookies, createSupabaseServerClient } from '@/server/auth/supabase';

export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  // Revokes this session's refresh token and clears the auth cookies.
  const supabase = await createSupabaseServerClient().catch(() => null);
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  // If Supabase could not be reached, still remove its cookies from this browser.
  await clearSupabaseCookies();
  return NextResponse.json({ ok: true });
});
