export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  // Revokes this session's refresh token and clears the auth cookies.
  await useSupabaseServerClient(event).auth.signOut({ scope: 'local' }).catch(() => undefined);

  // If Supabase could not be reached, still remove its cookies from this browser.
  clearSupabaseCookies(event);
  return { ok: true as const };
});
