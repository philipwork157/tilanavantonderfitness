import { customerMagicLinkRequestSchema } from '@tilana/contracts/checkout';
import { clients, orders } from '@tilana/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { enforceLoginRateLimit, enforceSameOrigin } from '../../../utils/auth-security';
import { getDatabase } from '../../../utils/database';
import { getSupabaseAdminClient } from '../../../utils/supabase-admin';
import { sendCustomerAccessEmail } from '../../../services/customer-access-emails';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  enforceLoginRateLimit(event);
  const parsed = customerMagicLinkRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' });

  const email = parsed.data.email.toLowerCase();
  const [buyer] = await getDatabase()
    .select({ id: clients.id, firstName: clients.firstName })
    .from(clients)
    .innerJoin(orders, and(eq(orders.clientId, clients.id), eq(orders.status, 'paid')))
    .where(sql`lower(${clients.email}) = ${email}`)
    .limit(1);

  // Always return the same response so this endpoint cannot reveal customer emails.
  if (buyer) {
    try {
      const config = useRuntimeConfig(event);
      const accountBaseUrl = String(config.accountBaseUrl || '').replace(/\/$/, '');
      if (!accountBaseUrl) throw new Error('Customer sign-in is not configured.');

      const supabase = getSupabaseAdminClient(event);
      const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
      const tokenHash = data.properties?.hashed_token;
      if (error || !tokenHash) {
        throw new Error(error?.message || 'Supabase did not return a customer sign-in token.');
      }

      const signInUrl = new URL('/api/customer/auth/confirm', `${accountBaseUrl}/`);
      signInUrl.searchParams.set('token_hash', tokenHash);
      signInUrl.searchParams.set('type', 'email');
      signInUrl.searchParams.set('next', '/account/programs');
      await sendCustomerAccessEmail({
        intendedRecipient: email,
        firstName: buyer.firstName,
        signInUrl: signInUrl.toString(),
      });
    } catch (error) {
      console.error('Customer magic-link delivery failed.', error instanceof Error ? error.message : error);
    }
  }

  return { ok: true as const };
});
