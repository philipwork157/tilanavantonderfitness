import { count, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { inquiries, newsletterSubscribers } from '@tilana/db';
import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { salesToday } from '@/server/services/sales';

/** Numbers for the overview tiles: enquiries, newsletter subscribers and today's sales. */
export const GET = handle(async () => {
  await requireAdmin();
  const db = getDatabase();

  const [active] = await db.select({ total: count() }).from(inquiries).where(ne(inquiries.status, 'archived'));
  const [unread] = await db.select({ total: count() }).from(inquiries).where(eq(inquiries.status, 'new'));
  const [subscribers] = await db.select({ total: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, 'subscribed'));

  const sales = await salesToday(db);

  return NextResponse.json({
    inquiries: { active: active?.total ?? 0, new: unread?.total ?? 0 },
    newsletter: { subscribers: subscribers?.total ?? 0 },
    sales,
  });
});
