import { runCustomerNotificationWorker } from '@server/services/customer-notifications';
import { isLocalCustomerWorkerEnabled } from '@server/utils/customer-delivery-configuration';

/** Local-only durable email retries. Fly uses the authenticated external recovery scheduler. */
export default defineNitroPlugin((nitro) => {
  if (!isLocalCustomerWorkerEnabled()) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await runCustomerNotificationWorker(); }
    catch { console.error('Local customer email retry failed. The queued work is retained.'); }
    finally { running = false; }
  }, 60_000);
  timer.unref();
  nitro.hooks.hook('close', () => { clearInterval(timer); });
});
