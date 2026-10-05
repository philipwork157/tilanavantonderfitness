export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  // Revokes this session's refresh token and clears the auth cookies.
  await useSupabaseServerClient(event).auth.signOut({ scope: 'local' }).catch(() => undefined);

  // If Supabase could not be reached, still remove its cookies from this browser.
  for (const name of Object.keys(parseCookies(event))) {
    if (name.startsWith('sb-')) deleteCookie(event, name, { path: '/' });
  }
  return { ok: true as const };
});
