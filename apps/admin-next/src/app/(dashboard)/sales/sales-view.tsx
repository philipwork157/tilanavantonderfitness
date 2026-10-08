'use client';

import { useQuery } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@/lib/api';
import { formatRand } from '@/lib/programs';
import type { AdminSales } from '@/lib/types';
import { OrdersSection } from './orders-section';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

const revenueChart = { revenue: { label: 'Sales', color: 'var(--tone-terracotta)' } } satisfies ChartConfig;

const shortDay = (date: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/** Sales: how much sold, when and which programs, plus the latest orders. */
export function SalesView() {
  const [days, setDays] = useState(30);
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['sales', days],
    queryFn: () => api<AdminSales>(`/api/sales?days=${days}`),
    placeholderData: (previous) => previous,
  });

  const period = PERIODS.find((item) => item.days === days)?.label ?? `${days} days`;
  const daily = (data?.daily ?? []).map((row) => ({ ...row, revenue: row.revenueCents / 100 }));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        eyebrow="Shop"
        title="Sales"
        description="Paid orders from the website. Prices are what buyers paid at the time."
        actions={<RefreshButton loading={isFetching} onClick={() => refetch()} />}
      />

      <ToggleGroup
        type="single"
        variant="outline"
        value={String(days)}
        onValueChange={(value) => value && setDays(Number(value))}
        className="mb-6 bg-card"
        aria-label="Period"
      >
        {PERIODS.map((item) => <ToggleGroupItem key={item.days} value={String(item.days)} className="px-4">{item.label}</ToggleGroupItem>)}
      </ToggleGroup>

      {error ? (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-6 text-sm font-medium text-destructive">{error.message}</div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Sales" hint={`Last ${period}`} value={data ? formatRand(data.totals.revenueCents) : undefined} />
            <Kpi label="Orders" hint="Paid" value={data?.totals.orders.toLocaleString('en-ZA')} />
            <Kpi label="Programs sold" hint="Across all orders" value={data?.totals.programsSold.toLocaleString('en-ZA')} />
            <Kpi label="Awaiting payment" hint="Started but not paid yet" value={data?.totals.awaitingPayment.toLocaleString('en-ZA')} />
          </div>

          {data && data.totals.emailsNotSent > 0 && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <MailWarning className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <p><strong>{data.totals.emailsNotSent} paid order{data.totals.emailsNotSent === 1 ? '' : 's'}</strong> could not be emailed. Look for “Email failed” below and use “Email PDFs again”.</p>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-labelledby="sales-day" className="min-w-0 rounded-2xl border bg-card p-5">
              <h2 id="sales-day" className="mb-4 text-sm font-extrabold tracking-[0.14em] uppercase">Sales per day</h2>
              {isPending ? <Skeleton className="h-64 w-full" /> : (
                <ChartContainer config={revenueChart} className="h-64 w-full">
                  <AreaChart data={daily} margin={{ left: 4, right: 8, top: 8 }} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => `R${value.toLocaleString('en-ZA')}`} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent labelFormatter={(label) => shortDay(String(label))} valueFormatter={(value) => formatRand(Math.round(value * 100))} />}
                    />
                    <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.35} strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </section>

            <section aria-labelledby="sales-program" className="min-w-0 rounded-2xl border bg-card p-5">
              <h2 id="sales-program" className="mb-4 text-sm font-extrabold tracking-[0.14em] uppercase">Programs sold</h2>
              {isPending ? <Skeleton className="h-64 w-full" /> : data && data.byProgram.length ? (
                <ProgramRanking rows={data.byProgram} />
              ) : (
                <p className="grid h-64 place-items-center text-sm text-muted-foreground">No programs sold in this period yet.</p>
              )}
            </section>
          </div>

          <OrdersSection recent={data?.recent} loading={isPending} period={period} />
        </>
      )}
    </div>
  );
}

function Kpi({ label, hint, value }: { label: string; hint: string; value: string | undefined }) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5">
      <p className="text-sm font-bold">{label}</p>
      <div className="mt-2 font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
        {value === undefined ? <Skeleton className="h-9 w-24" /> : value}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Programs sold, best seller first. A few programs read better as a ranked
 * list than as a chart with a number axis: the counts and takings are written
 * out, and the thin bar only shows each program's share of the best seller.
 */
function ProgramRanking({ rows }: { rows: AdminSales['byProgram'] }) {
  const ranked = [...rows].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents);
  const most = Math.max(...ranked.map(row => row.sold), 1);
  return (
    <ol className="grid max-h-64 gap-4 overflow-y-auto pr-1">
      {ranked.map((row) => {
        const [name, volume] = row.label.split(' · ');
        return (
          <li key={row.label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{name}</span>
                {volume && <span className="text-muted-foreground"> · {volume}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{row.sold.toLocaleString('en-ZA')} sold</span>
                <span className="text-muted-foreground"> · {formatRand(row.revenueCents)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-tone-sage" style={{ width: `${Math.max((row.sold / most) * 100, 2)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
