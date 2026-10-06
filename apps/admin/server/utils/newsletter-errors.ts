import { CampaignError } from '../services/newsletter-campaigns';

/** Turns a CampaignError into a friendly HTTP error; anything else is rethrown. */
export async function campaignAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  }
  catch (error) {
    if (error instanceof CampaignError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
}

/** First zod issue as a readable sentence. */
export function firstIssue(issues: { message: string }[] | undefined, fallback: string): string {
  return issues?.[0]?.message ?? fallback;
}
