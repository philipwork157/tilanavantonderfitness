import 'server-only';
import { orderItems, orders, type Database } from '@tilana/db';
import { and, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm';

/** Days are counted in South African time. */
const ZONE = 'Africa/Johannesburg';

export const SALES_PERIODS = [7, 30, 90, 365] as const;

/** "2026-10-08" in South African time. */
export function saDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Every day from `days - 1` days ago up to today, so the chart has no gaps. */
export function dayRange(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, index) => saDate(new Date(now.getTime() - (days - 1 - index) * 86_400_000)));
}

/** Paid sales in the last `days` days, for the Sales page. */
export async function salesSummary(db: Database, days: number, now = new Date()) {
  const range = dayRange(days, now);
  const since = new Date(`${range[0]}T00:00:00+02:00`);
  const paidSince = and(eq(orders.status, 'paid'), gte(orders.paidAt, since));
  // The zone is written into the SQL (not a parameter) so SELECT and GROUP BY match.
  const day = sql<string>`to_char(${orders.paidAt} at time zone ${sql.raw(`'${ZONE}'`)}, 'YYYY-MM-DD')`;

  const [totals] = await db.select({ orders: count(), revenueCents: sum(orders.totalCents) }).from(orders).where(paidSince);
  const [sold] = await db.select({ items: count() }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(paidSince);
  const [waiting] = await db.select({ orders: count() }).from(orders).where(and(eq(orders.status, 'pending'), gte(orders.createdAt, since)));
  const [unsent] = await db.select({ orders: count() }).from(orders).where(and(eq(orders.status, 'paid'), eq(orders.deliveryStatus, 'failed')));

  const perDay = await db.select({ day, orders: count(), revenueCents: sum(orders.totalCents) }).from(orders).where(paidSince).groupBy(day);
  const byDay = new Map(perDay.map(row => [row.day, row]));
  const daily = range.map(date => ({
    date,
    orders: byDay.get(date)?.orders ?? 0,
    revenueCents: Number(byDay.get(date)?.revenueCents ?? 0),
  }));

  const perProgram = await db.select({ label: orderItems.label, sold: count(), revenueCents: sum(orderItems.priceCents) })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(paidSince)
    .groupBy(orderItems.label).orderBy(desc(count()));

  const recentOrders = await db.select().from(orders).where(gte(orders.createdAt, since)).orderBy(desc(orders.createdAt)).limit(25);
  const recentItems = recentOrders.length
    ? await db.select({ orderId: orderItems.orderId, label: orderItems.label }).from(orderItems).where(inArray(orderItems.orderId, recentOrders.map(order => order.id)))
    : [];

  return {
    days,
    totals: {
      revenueCents: Number(totals?.revenueCents ?? 0),
      orders: totals?.orders ?? 0,
      programsSold: sold?.items ?? 0,
      awaitingPayment: waiting?.orders ?? 0,
      emailsNotSent: unsent?.orders ?? 0,
    },
    daily,
    byProgram: perProgram.map(row => ({ label: row.label, sold: row.sold, revenueCents: Number(row.revenueCents ?? 0) })),
    recent: recentOrders.map(order => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      buyer: `${order.firstName} ${order.lastName}`.trim(),
      email: order.email,
      totalCents: order.totalCents,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      deliveryError: order.deliveryError,
      testPayment: order.paymentMode === 'test',
      programs: recentItems.filter(item => item.orderId === order.id).map(item => item.label),
    })),
  };
}
