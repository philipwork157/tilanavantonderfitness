import { adminPaymentRefundRequestSchema } from '@tilana/contracts/payments';
import { initiatePaystackRefund, PaystackRefundError } from '../../../../services/paystack';
import { requireAdmin } from '../../../../utils/admin-auth';
import { enforceSameOrigin } from '../../../../utils/auth-security';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  const session = await requireAdmin(event);
  const orderId = parseDatabaseId(getRouterParam(event, 'id'));
  if (orderId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid order identifier.' });
  }

  const parsed = adminPaymentRefundRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Please check the refund details.',
    });
  }

  try {
    const refund = await initiatePaystackRefund(orderId, parsed.data, session.user.id);
    setResponseStatus(event, 202);
    return { ok: true, refund };
  } catch (error) {
    if (error instanceof PaystackRefundError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
});
