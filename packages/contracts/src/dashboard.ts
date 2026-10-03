import { z } from 'zod';

export const adminDashboardPeriodValues = [7, 30, 60, 90, 120, 150, 180] as const;
export type AdminDashboardPeriod = (typeof adminDashboardPeriodValues)[number];

/** A clear payment dashboard must also account for purchased programs awaiting email. */
export const adminDashboardAlertsSchema = z.object({
  failedPayments: z.number().int().nonnegative(),
  stalePayments: z.number().int().nonnegative(),
  refundsNeedingAttention: z.number().int().nonnegative(),
  programEmailsNeedingAttention: z.number().int().nonnegative(),
});

export const adminDashboardQuerySchema = z.object({
  periodDays: z.coerce
    .number()
    .pipe(z.union([
      z.literal(7),
      z.literal(30),
      z.literal(60),
      z.literal(90),
      z.literal(120),
      z.literal(150),
      z.literal(180),
    ]))
    .default(30),
});
