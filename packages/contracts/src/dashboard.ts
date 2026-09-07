import { z } from 'zod';

export const adminDashboardPeriodValues = [7, 30, 60, 90, 120, 150, 180] as const;
export type AdminDashboardPeriod = (typeof adminDashboardPeriodValues)[number];

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
