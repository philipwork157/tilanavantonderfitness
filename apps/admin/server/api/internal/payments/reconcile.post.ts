import { authorizePaymentRecovery } from '@server/utils/payment-recovery-auth';
import { runPaymentRecovery } from '@server/services/payment-recovery';

/** External scheduler wakes sleeping Fly machines; no browser session or public provider payload is accepted. */
export default defineEventHandler(async (event) => {
  authorizePaymentRecovery(getHeader(event, 'authorization'), useRuntimeConfig(event));
  setHeader(event, 'cache-control', 'no-store');
  const result = await runPaymentRecovery();
  if (result.alerts.failed > 0) throw createError({ statusCode: 503, statusMessage: 'Recovery alert delivery requires attention.' });
  return result;
});
