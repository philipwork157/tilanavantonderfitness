import { linkVerifiedCustomerAccount } from '../../../utils/customer-auth';
import { createSupabaseAuthClient } from '../../../utils/supabase-auth';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = typeof query.code === 'string' ? query.code : '';
  const tokenHash = typeof query.token_hash === 'string' && query.token_hash.length <= 512
    ? query.token_hash
    : '';
  const next = typeof query.next === 'string' && query.next.startsWith('/account/')
    ? query.next
    : '/account/programs';
  if (!code && !tokenHash) return sendRedirect(event, '/account/sign-in?error=invalid-link', 302);

  const supabase = createSupabaseAuthClient(event);
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    : await supabase.auth.exchangeCodeForSession(code);
  if (error) return sendRedirect(event, '/account/sign-in?error=expired-link', 302);

  try {
    await linkVerifiedCustomerAccount(event);
  } catch {
    await supabase.auth.signOut();
    return sendRedirect(event, '/account/sign-in?error=no-purchases', 302);
  }

  return sendRedirect(event, next, 302);
});
