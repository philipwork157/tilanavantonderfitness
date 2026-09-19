import { customerMagicLinkRequestSchema } from '@tilana/contracts/checkout';
import { clients, orders } from '@tilana/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { claimLoginRecipient, enforceLoginRateLimit, enforceSameOrigin } from '@server/utils/auth-security';
import { getDatabase } from '@server/utils/database';
import { readZodBody } from '@server/utils/route-validation';
import { queueCustomerLogin, deliverCustomerNotifications } from '@server/services/customer-notifications';
import { assertPaystackDatabaseEnvironment, getCustomerAccountBaseUrl } from '@server/utils/paystack-configuration';
import { customerPurchaseHistoryCondition } from '@server/utils/customer-purchase-history';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  await enforceLoginRateLimit(event);
  const body = await readZodBody(
    event,
    customerMagicLinkRequestSchema,
    'Enter a valid email address.',
    { exposeIssueMessage: false },
  );

  const email = body.email.toLowerCase();
  const mayDeliver = await claimLoginRecipient(email);
  await assertPaystackDatabaseEnvironment();
  getCustomerAccountBaseUrl(useRuntimeConfig(event));
  const [buyer] = await getDatabase()
    .select({ id: clients.id, firstName: clients.firstName })
    .from(clients)
    .innerJoin(orders, and(eq(orders.clientId, clients.id), customerPurchaseHistoryCondition()))
    .where(sql`lower(${clients.email}) = ${email}`)
    .limit(1);

  // Always return the same response so this endpoint cannot reveal customer emails.
  if (buyer && mayDeliver) {
    try {
      const jobId = await queueCustomerLogin(buyer.id);
      await deliverCustomerNotifications(jobId);
    } catch {
      console.error('Customer magic-link queue or delivery requires attention.');
    }
  }

  return { ok: true as const };
});
