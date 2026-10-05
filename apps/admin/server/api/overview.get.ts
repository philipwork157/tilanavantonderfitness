import { count, eq, ne } from 'drizzle-orm';
import { inquiries } from '@tilana/db';

/** Numbers for the overview tiles. Each tile only appears once its feature exists. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const db = useDatabase();

  const [active] = await db.select({ total: count() }).from(inquiries).where(ne(inquiries.status, 'archived'));
  const [unread] = await db.select({ total: count() }).from(inquiries).where(eq(inquiries.status, 'new'));

  return {
    inquiries: { active: active?.total ?? 0, new: unread?.total ?? 0 },
  };
});
