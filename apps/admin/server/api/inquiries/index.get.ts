import { desc, eq, ne } from 'drizzle-orm';
import { inquiries } from '@tilana/db';
import { inquiryViewSchema } from '@tilana/contracts/admin-inquiries';

/** Admin list of website enquiries, newest first. ?view=active (default) or archived. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const view = inquiryViewSchema.parse(getQuery(event).view);

  const rows = await useDatabase().select({
    id: inquiries.id,
    name: inquiries.name,
    email: inquiries.email,
    interestLabel: inquiries.interestLabel,
    message: inquiries.message,
    status: inquiries.status,
    privacyAcceptedAt: inquiries.privacyAcceptedAt,
    notifiedAt: inquiries.notifiedAt,
    notificationError: inquiries.notificationError,
    createdAt: inquiries.createdAt,
  })
    .from(inquiries)
    .where(view === 'archived' ? eq(inquiries.status, 'archived') : ne(inquiries.status, 'archived'))
    .orderBy(desc(inquiries.createdAt))
    .limit(500);

  return { inquiries: rows };
});
