import { z } from 'zod';

export const inquiryStatusSchema = z.enum(['new', 'replied', 'archived']);
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

/** Which list the admin is looking at. Active means anything not archived. */
export const inquiryViewSchema = z.enum(['active', 'archived']).catch('active');
export type InquiryView = z.infer<typeof inquiryViewSchema>;

export const updateInquiryRequestSchema = z.object({
  status: inquiryStatusSchema,
});
