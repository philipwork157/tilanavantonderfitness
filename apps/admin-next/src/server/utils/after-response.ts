import 'server-only';
import { after } from 'next/server';
import { logger } from '../logger';

/**
 * Runs slow follow-up work (emailing PDFs) after the response has been sent,
 * so Paystack and the buyer are not kept waiting. Outside a request (tests,
 * scripts) it simply runs in the background.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const run = () => task().catch((error: unknown) => logger.error({ err: error }, 'Background task failed'));
  try {
    after(run);
  } catch {
    void run();
  }
}
