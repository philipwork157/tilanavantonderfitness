import { campaignsToResume } from '../services/newsletter-sending';

/** After a restart or deploy, carry on sending any campaign that was mid-send. */
export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().databaseUrl) return;
  setTimeout(() => {
    campaignsToResume(useDatabase())
      .then(ids => ids.forEach(startCampaignRunner))
      .catch(error => console.error('Could not resume newsletter campaigns', error));
  }, 5000);
});
