import 'server-only';
import { getDatabase } from './db';
import { campaignsToResume } from './services/newsletter-sending';
import { startCampaignRunner } from './utils/newsletter';
import { logger } from './logger';

/** Called from instrumentation.ts. Waits a moment so the server is ready first. */
export function resumeCampaignsAfterStart() {
  setTimeout(() => {
    campaignsToResume(getDatabase())
      .then((ids) => ids.forEach(startCampaignRunner))
      .catch((error: unknown) => logger.error({ err: error }, 'Could not resume newsletter campaigns'));
  }, 5000);
}
