import type { AdminDashboardPeriod } from '@tilana/contracts/dashboard';
import { clients, contactSubmissions, newsletterSubscribers, paymentRefunds, payments } from '@tilana/db/schema';
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDatabase } from '../utils/database';

const JOHANNESBURG_TIME_ZONE = 'Africa/Johannesburg';
const STALE_PAYMENT_MINUTES = 30;

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

function createSalesSeries(periodDays: AdminDashboardPeriod) {
  const todayKey = johannesburgDateKey(new Date());
  const [year, month, day] = todayKey.split('-').map(Number);

  return Array.from({ length: periodDays }, (_, index) => {
    const daysAgo = periodDays - index - 1;
    const date = new Date(Date.UTC(year!, month! - 1, day! - daysAgo, 12));

    return {
      date: johannesburgDateKey(date),
      amountCents: 0,
      saleCount: 0,
    };
  });
}

export async function getAdminDashboard(
  paystackEnvironment: PaystackEnvironment,
  periodDays: AdminDashboardPeriod,
) {
  const database = getDatabase();
  const salesSeries = createSalesSeries(periodDays);
  const salesByDate = new Map(salesSeries.map(item => [item.date, item]));
  const now = Date.now();
  const salesQueryStart = new Date(now - (periodDays + 1) * 24 * 60 * 60 * 1000);
  const stalePaymentThreshold = new Date(now - STALE_PAYMENT_MINUTES * 60 * 1000);

  const [
    newContactsResult,
    clientsResult,
    subscribersResult,
    recentPayments,
    failedPaymentsResult,
    stalePaymentsResult,
    refundAlertsResult,
  ] =
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
      database
        .select({ value: count() })
        .from(payments)
        .where(and(
          eq(payments.provider, 'paystack'),
          eq(payments.environment, paystackEnvironment),
          inArray(payments.status, ['failed', 'abandoned', 'reversed']),
          gte(payments.updatedAt, salesQueryStart),
        )),
      database
        .select({ value: count() })
        .from(payments)
        .where(and(
          eq(payments.provider, 'paystack'),
          eq(payments.environment, paystackEnvironment),
          eq(payments.status, 'pending'),
          gte(payments.createdAt, salesQueryStart),
          lte(payments.createdAt, stalePaymentThreshold),
        )),
      database
        .select({ value: count() })
        .from(paymentRefunds)
        .innerJoin(payments, eq(paymentRefunds.paymentId, payments.id))
        .where(and(
          eq(payments.environment, paystackEnvironment),
          eq(paymentRefunds.status, 'needs-attention'),
        )),
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
      periodDays,
      series: salesSeries,
    },
    alerts: {
      failedPayments: failedPaymentsResult[0]?.value ?? 0,
      stalePayments: stalePaymentsResult[0]?.value ?? 0,
      refundsNeedingAttention: refundAlertsResult[0]?.value ?? 0,
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
