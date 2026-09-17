import { adminPaymentRecoveryRequestSchema } from '@tilana/contracts/payments';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody } from '@server/utils/route-validation';
import { replayPaymentEvent, requestPaymentRecovery } from '@server/services/payment-recovery';

/** Only administrators may replay stored evidence or enqueue a fresh provider read. */
export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const input = await readZodBody(event, adminPaymentRecoveryRequestSchema, 'Invalid recovery request.');
  const result = input.action === 'replay'
    ? await replayPaymentEvent(input.eventId, session.user.id)
    : input.action === 'acknowledge'
      ? await requestPaymentRecovery(input.paymentId, session.user.id, 'acknowledge')
    : await requestPaymentRecovery(input.paymentId, session.user.id);
  setResponseStatus(event, input.action === 'reconcile' ? 202 : 200);
  return result;
});
