import { clients, contactSubmissions, newsletterSubscribers, payments } from '@tilana/db/schema';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

const SALES_PERIOD_DAYS = 30;
const JOHANNESBURG_TIME_ZONE = 'Africa/Johannesburg';

type PaystackEnvironment = 'test' | 'live';

function johannesburgDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: JOHANNESBURG_TIME_ZONE,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function createSalesSeries() {
  const todayKey = johannesburgDateKey(new Date());
  const [year, month, day] = todayKey.split('-').map(Number);

  return Array.from({ length: SALES_PERIOD_DAYS }, (_, index) => {
    const daysAgo = SALES_PERIOD_DAYS - index - 1;
    const date = new Date(Date.UTC(year!, month! - 1, day! - daysAgo, 12));

    return {
      date: johannesburgDateKey(date),
      amountCents: 0,
      saleCount: 0,
    };
  });
}

export async function getAdminDashboard(paystackEnvironment: PaystackEnvironment) {
  const database = getDatabase();
  const salesSeries = createSalesSeries();
  const salesByDate = new Map(salesSeries.map(item => [item.date, item]));
  const salesQueryStart = new Date(Date.now() - (SALES_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000);

  const [newContactsResult, clientsResult, subscribersResult, recentPayments] =
    await Promise.all([
      database.select({ value: count() }).from(contactSubmissions).where(eq(contactSubmissions.status, 'new')),
      database.select({ value: count() }).from(clients),
      database
        .select({ value: count() })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.status, 'subscribed')),
      database
        .select({
          amountCents: payments.amountCents,
          refundedAmountCents: payments.refundedAmountCents,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .where(and(
          eq(payments.provider, 'paystack'),
          eq(payments.environment, paystackEnvironment),
          eq(payments.currency, 'ZAR'),
          inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded']),
          gte(payments.paidAt, salesQueryStart),
        ))
        .orderBy(desc(payments.paidAt)),
    ]);

  for (const payment of recentPayments) {
    if (!payment.paidAt) continue;

    const bucket = salesByDate.get(johannesburgDateKey(payment.paidAt));
    const netAmountCents = Math.max(0, payment.amountCents - payment.refundedAmountCents);

    if (!bucket || netAmountCents === 0) continue;

    bucket.amountCents += netAmountCents;
    bucket.saleCount += 1;
  }

  const sales = salesSeries.reduce(
    (summary, item) => {
      summary.totalCents += item.amountCents;
      summary.saleCount += item.saleCount;
      return summary;
    },
    { totalCents: 0, saleCount: 0 },
  );

  return {
    stats: {
      newContacts: newContactsResult[0]?.value ?? 0,
      clients: clientsResult[0]?.value ?? 0,
      subscribers: subscribersResult[0]?.value ?? 0,
    },
    sales: {
      ...sales,
      currency: 'ZAR' as const,
      environment: paystackEnvironment,
      periodDays: SALES_PERIOD_DAYS,
      series: salesSeries,
    },
  };
}

export async function listContactSubmissions() {
  return getDatabase()
    .select({
      id: contactSubmissions.id,
      fullName: contactSubmissions.fullName,
      email: contactSubmissions.email,
      interest: contactSubmissions.interest,
      message: contactSubmissions.message,
      status: contactSubmissions.status,
      createdAt: contactSubmissions.createdAt,
    })
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt))
    .limit(100);
}

export async function listNewsletterSubscribers() {
  return getDatabase()
    .select({
      id: newsletterSubscribers.id,
      email: newsletterSubscribers.email,
      status: newsletterSubscribers.status,
      source: newsletterSubscribers.source,
      consentedAt: newsletterSubscribers.consentedAt,
      confirmedAt: newsletterSubscribers.confirmedAt,
      unsubscribedAt: newsletterSubscribers.unsubscribedAt,
      createdAt: newsletterSubscribers.createdAt,
    })
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt))
    .limit(200);
}
