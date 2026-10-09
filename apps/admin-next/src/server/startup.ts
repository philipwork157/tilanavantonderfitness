import 'server-only';
import { getDatabase } from './db';
import { campaignsToResume } from './services/newsletter-sending';
import { startCampaignRunner } from './utils/newsletter';
import { logger } from './logger';
import { runOrderChecksOnce } from './services/order-checks';
import { serverConfig } from './config';

/** Called from instrumentation.ts. Waits a moment so the server is ready first. */
export function resumeCampaignsAfterStart() {
  setTimeout(() => {
    campaignsToResume(getDatabase())
      .then((ids) => ids.forEach(startCampaignRunner))
      .catch((error: unknown) => logger.error({ err: error }, 'Could not resume newsletter campaigns'));
  }, 5000);
}

const ORDER_CHECK_EVERY = 5 * 60_000;

/**
 * Background order checks (unconfirmed payments, PDF email retries, pending
 * refunds) every 5 minutes while this server runs. Only with Paystack set up.
 */
export function startOrderChecks() {
  if (!serverConfig().paystackSecretKey) return;
  const run = () => void runOrderChecksOnce(getDatabase());
  setTimeout(run, 30_000).unref();
  setInterval(run, ORDER_CHECK_EVERY).unref();
}
