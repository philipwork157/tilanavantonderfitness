import { inquiryViewSchema } from '@tilana/contracts/admin-inquiries';
import { inquiries } from '@tilana/db';
import { desc, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';

/** Admin list of website enquiries, newest first. ?view=active (default) or archived. */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const view = inquiryViewSchema.parse(new URL(request.url).searchParams.get('view') ?? undefined);
  const rows = await getDatabase().select({
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
  return Response.json({ inquiries: rows });
});
