/**
 * Runs once when the server starts. After a restart or deploy, carry on
 * sending any newsletter campaign that was mid-send, and start the
 * background order checks.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL) return;
  const { resumeCampaignsAfterStart, startOrderChecks } = await import('./server/startup');
  resumeCampaignsAfterStart();
  startOrderChecks();
}
