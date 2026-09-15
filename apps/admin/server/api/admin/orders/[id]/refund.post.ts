import { adminPaymentRefundRequestSchema } from '@tilana/contracts/payments';
import { initiatePaystackRefund, PaystackRefundError } from '@server/services/paystack';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const orderId = requireRouteDatabaseId(event, 'order');
  const body = await readZodBody(event, adminPaymentRefundRequestSchema, 'Please check the refund details.');

  try {
    const refund = await initiatePaystackRefund(orderId, body, session.user.id);
    setResponseStatus(event, 202);
    return { ok: true, refund };
  } catch (error) {
    if (error instanceof PaystackRefundError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
});
