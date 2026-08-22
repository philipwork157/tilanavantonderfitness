import type { contactSubmissions } from '../schema/contact-submissions';

/** Contact row returned by Drizzle. */
export type ContactSubmission = typeof contactSubmissions.$inferSelect;

/** Contact row accepted by Drizzle for an insert. */
export type NewContactSubmission = typeof contactSubmissions.$inferInsert;

