'use client';

import { useQuery } from '@tanstack/react-query';
import { MailWarning, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { formatRand } from '@/lib/programs';
import { orderDeliveryStatus, orderStatus, statusStyle } from '@/lib/status';
import type { AdminSales } from '@/lib/types';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

const revenueChart = { revenue: { label: 'Sales', color: 'var(--tone-terracotta)' } } satisfies ChartConfig;
const programChart = { sold: { label: 'Sold', color: 'var(--tone-sage)' } } satisfies ChartConfig;

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
              <p><strong>{data.totals.emailsNotSent} paid order{data.totals.emailsNotSent === 1 ? '' : 's'}</strong> could not be emailed. Look for “Email failed” below and send those PDFs by hand.</p>
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
                <ChartContainer config={programChart} className="h-64 w-full">
                  <BarChart data={data.byProgram} layout="vertical" margin={{ left: 0, right: 12 }} accessibilityLayer>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={120} tickFormatter={(label: string) => label.replace(/ · /, ' ')} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="sold" fill="var(--color-sold)" radius={6} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="grid h-64 place-items-center text-sm text-muted-foreground">No programs sold in this period yet.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="sales-orders">
            <h2 id="sales-orders" className="mb-3 text-sm font-extrabold tracking-[0.14em] uppercase">Latest orders</h2>
            {!isPending && data?.recent.length === 0 ? (
              <EmptyState icon={ShoppingBag} title="No orders yet" description={`Nobody has checked out in the last ${period}.`} />
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-5">Order</TableHead>
                      <TableHead className="hidden px-5 md:table-cell">Programs</TableHead>
                      <TableHead className="hidden px-5 text-right sm:table-cell">Amount</TableHead>
                      <TableHead className="px-5">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending && Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}><TableCell colSpan={4} className="px-5 py-4"><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    ))}
                    {data?.recent.map((order) => {
                      const status = statusStyle(orderStatus, order.status);
                      const delivery = statusStyle(orderDeliveryStatus, order.deliveryStatus);
                      return (
                        <TableRow key={order.orderNumber}>
                          <TableCell className="px-5 py-3 whitespace-normal">
                            <span className="grid">
                              <span className="font-semibold">{order.buyer} <span className="font-normal text-muted-foreground">· {order.orderNumber}</span></span>
                              <span className="text-xs break-words text-muted-foreground">{order.email} · {formatDateTime(order.paidAt ?? order.createdAt)}</span>
                              <span className="text-xs text-muted-foreground md:hidden">{order.programs.join(', ')}<span className="font-semibold text-foreground sm:hidden"> · {formatRand(order.totalCents)}</span></span>
                            </span>
                          </TableCell>
                          <TableCell className="hidden px-5 text-sm whitespace-normal md:table-cell">{order.programs.join(', ')}</TableCell>
                          <TableCell className="hidden px-5 text-right font-semibold tabular-nums sm:table-cell">{formatRand(order.totalCents)}</TableCell>
                          <TableCell className="px-5 whitespace-normal">
                            <span className="flex flex-wrap gap-1.5">
                              <StatusBadge label={status.label} tone={status.tone} />
                              {order.status === 'paid' && <StatusBadge label={delivery.label} tone={delivery.tone} />}
                              {order.testPayment && <StatusBadge label="Test" tone="warning" />}
                            </span>
                            {order.deliveryError && <span className="mt-1 block text-xs text-destructive">{order.deliveryError}</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
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
