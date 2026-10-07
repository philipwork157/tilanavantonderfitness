/**
 * Runs once when the server starts. After a restart or deploy, carry on
 * sending any newsletter campaign that was mid-send.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL) return;
  const { resumeCampaignsAfterStart } = await import('./server/startup');
  resumeCampaignsAfterStart();
}
