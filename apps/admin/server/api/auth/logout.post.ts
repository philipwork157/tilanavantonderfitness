import { enforceSameOrigin } from '../../utils/auth-security';
import { createSupabaseAuthClient } from '../../utils/supabase-auth';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  const supabase = createSupabaseAuthClient(event);
  await supabase.auth.signOut();
  return { ok: true as const };
});
