import type { ContactFormRequest } from '@tilana/contracts/contact';
import { contactSubmissions } from '@tilana/db/schema';
import { getDatabase } from '../utils/database';

type CreateContactSubmissionInput = Pick<
  ContactFormRequest,
  'name' | 'email' | 'interest' | 'message'
>;

/**
 * Persists a validated public enquiry.
 *
 * HTTP validation and anti-abuse checks belong in the route. Database mapping
 * and future contact-domain rules belong here so admin endpoints can reuse them.
 */
export async function createContactSubmission(input: CreateContactSubmissionInput) {
  const [submission] = await getDatabase()
    .insert(contactSubmissions)
    .values({
      fullName: input.name,
      email: input.email.toLowerCase(),
      interest: input.interest,
      message: input.message,
    })
    .returning({
      id: contactSubmissions.id,
      createdAt: contactSubmissions.createdAt,
    });

  if (!submission) throw new Error('The contact submission was not created.');
  return submission;
}

