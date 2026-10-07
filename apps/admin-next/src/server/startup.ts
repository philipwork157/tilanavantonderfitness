import 'server-only';
import { getDatabase } from './db';
import { campaignsToResume } from './services/newsletter-sending';
import { startCampaignRunner } from './utils/newsletter';

/** Called from instrumentation.ts. Waits a moment so the server is ready first. */
export function resumeCampaignsAfterStart() {
  setTimeout(() => {
    campaignsToResume(getDatabase())
      .then((ids) => ids.forEach(startCampaignRunner))
      .catch((error: unknown) => console.error('Could not resume newsletter campaigns', error));
  }, 5000);
}
