'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowUpRight, BadgeCheck, CreditCard, ExternalLink, Eye, Globe, Info, Monitor, MousePointerClick, ShoppingBasket, Smartphone,
  Tablet, TriangleAlert, Zap, type LucideIcon,
} from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RefreshButton } from '@/components/refresh-button';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@/lib/api';
import type { AdminWebsiteLive, AdminWebsiteStats } from '@/lib/types';
import { cn } from '@/lib/utils';

const PERIODS = [7, 30, 90] as const;
type Site = 'live' | 'testing';
type Stats = Extract<AdminWebsiteStats, { configured: true }>;
type Live = Extract<AdminWebsiteLive, { configured: true }>;
type Metric = 'visitors' | 'pageviews';

const metricChart = {
  visitors: { label: 'Visitors', color: 'var(--tone-terracotta)' },
  pageviews: { label: 'Page views', color: 'var(--tone-terracotta)' },
} satisfies ChartConfig;

const n = (value: number) => value.toLocaleString('en-ZA');
const shortDay = (date: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%');
const share = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** 1280 seconds as "21m 20s", like PostHog. */
function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${total % 60}s`;
}

/** The default matches the server: your own test visits on localhost, the website everywhere else. */
const subscribeNever = () => () => {};
function useDefaultSite(): Site {
  return useSyncExternalStore(subscribeNever, () => (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? 'testing' : 'live'), () => 'live');
}

/** Website: visitors, visits, pages, channels, clicks and the buying funnel from PostHog, plus who is on the site now. */
export function WebsiteView() {
  const defaultSite = useDefaultSite();
  const [days, setDays] = useState<number>(30);
  const [chosenSite, setSite] = useState<Site | null>(null);
  const site = chosenSite ?? defaultSite;

  const stats = useQuery({
    queryKey: ['website', days, site],
    queryFn: () => api<AdminWebsiteStats>(`/api/website?days=${days}&site=${site}`),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
  const live = useQuery({
    queryKey: ['website-live', site],
    queryFn: () => api<AdminWebsiteLive>(`/api/website/live?site=${site}`),
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });

  if (stats.data && !stats.data.configured) return <NotConnected />;
  const data = stats.data?.configured ? stats.data : undefined;
  const liveData = live.data?.configured ? live.data : undefined;
  const errors = [...(data?.errors ?? []), ...(liveData?.errors ?? [])];
  const loading = stats.isPending;
  const totals = data?.totals;
  const changes = data?.changes;
  /** undefined while loading (skeleton), null when PostHog could not answer (dash). */
  const value = <T,>(read: (t: NonNullable<Stats['totals']>) => T | null): T | null | undefined => (loading ? undefined : totals ? read(totals) : null);

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Website"
        title="Visitors"
        description="How people find and use the website. Counted without cookies, so each visitor counts once per day."
        actions={(
          <>
            {data && (
              <Button asChild variant="outline" className="rounded-full bg-card">
                <a href={data.postHogUrl} target="_blank" rel="noreferrer">PostHog <ExternalLink /></a>
              </Button>
            )}
            <RefreshButton loading={stats.isFetching || live.isFetching} onClick={() => { void stats.refetch(); void live.refetch(); }} />
          </>
        )}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" variant="outline" value={String(days)} onValueChange={(next) => next && setDays(Number(next))} className="bg-card" aria-label="Period">
          {PERIODS.map((item) => <ToggleGroupItem key={item} value={String(item)} className="px-4">{item} days</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={site} onValueChange={(next) => next && setSite(next as Site)} className="bg-card" aria-label="Which visits">
          <ToggleGroupItem value="live" className="px-4">Live website</ToggleGroupItem>
          <ToggleGroupItem value="testing" className="px-4">My testing</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {stats.error ? (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-6 text-sm font-medium text-destructive">{stats.error.message}</div>
      ) : (
        <div className="grid gap-4 xl:gap-5">
          <LiveNow data={liveData} loading={live.isPending} now={live.dataUpdatedAt} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-7">
            <Kpi label="Visitors" hint="Each person once a day" value={value((t) => n(t.visitors))} change={changes?.visitors} />
            <Kpi label="Page views" hint="Pages opened" value={value((t) => t.pageviews === null ? null : n(t.pageviews))} change={changes?.pageviews} />
            <Kpi label="Visits" hint="Sessions on the site" value={value((t) => t.sessions === null ? null : n(t.sessions))} change={changes?.sessions} />
            <Kpi label="Visit length" hint="Average time on the site" value={value((t) => t.duration === null ? null : duration(t.duration))} change={changes?.duration} />
            <Kpi label="Bounce rate" hint="Left after one page" value={value((t) => t.bounceRate === null ? null : share(t.bounceRate))} change={changes?.bounceRate} points lowerIsBetter />
            <Kpi label="Clicks" hint="Buttons and links" value={value((t) => t.clicks === null ? null : n(t.clicks))} change={changes?.clicks} />
            <Kpi label="Basket adds" hint="Programs added" value={value((t) => t.basketAdds === null ? null : n(t.basketAdds))} change={changes?.basketAdds} className="col-span-2 sm:col-span-3 lg:col-span-2 2xl:col-span-1" />
          </div>

          {data?.approximate && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-status-info/30 bg-status-info-bg px-4 py-3 text-xs text-status-info">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              PostHog&apos;s visit data could not be read, so visits, visit length, bounce rate and channels are estimated from page views and may differ a little from PostHog.
            </p>
          )}

          {/* Wide blocks take two thirds, narrow ones a third; on medium screens the narrow ones pair up. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-flow-row-dense lg:grid-cols-2 xl:grid-cols-12 xl:gap-5">
            <VisitorsChart daily={data?.daily} loading={loading} className="lg:col-span-2 xl:col-span-8" />
            <Funnel steps={data?.funnel} loading={loading} className="xl:col-span-4" />

            <Card title="Pages" id="pages" hint="Bounce rate counts visits that started on the page." className="lg:col-span-2 xl:col-span-8">
              <PagesTable rows={data?.pages} loading={loading} />
            </Card>
            <Card title="Channels" id="channels" hint="How each visit started.">
              <Ranked loading={loading} empty="No visits in this period yet." tone="bg-tone-sand" rows={data?.channels?.map((row) => ({
                key: row.name, label: <span className="font-semibold">{row.name}</span>, value: row.visitors, unit: 'visitors',
                detail: `${n(row.pageviews)} view${row.pageviews === 1 ? '' : 's'} · ${share(row.bounceRate)} bounce`,
              }))} />
            </Card>

            <Card title="Busiest times" id="hours" hint="Visitors by weekday and hour, South African time." className="lg:col-span-2 xl:col-span-8">
              <Heatmap cells={data?.hours} loading={loading} />
            </Card>
            <Card title="Phone or computer" id="devices">
              <Devices data={data?.devices} loading={loading} />
            </Card>

            <Card title="Landing pages" id="landing" hint="The first page of each visit.">
              <Ranked loading={loading} empty="No visits in this period yet." rows={data?.landing?.slice(0, 8).map((row) => ({
                key: row.path, label: <PathLabel path={row.path} />, value: row.sessions, unit: 'visits', detail: `${share(row.bounceRate)} bounce`,
              }))} />
            </Card>
            <Card title="Referring websites" id="sources" hint="Where visitors clicked a link to the site.">
              <Ranked loading={loading} empty="No visits in this period yet." tone="bg-tone-sand" rows={data?.sources?.map((row) => ({
                key: row.name, label: <span className="font-semibold">{row.name}</span>, value: row.visitors, unit: 'visitors',
              }))} />
            </Card>
            <Card title="Most clicked" id="top-clicks" hint="What people click, and on which page.">
              <Ranked loading={loading} empty="No clicks in this period yet." tone="bg-tone-caramel" rows={data?.clicks?.slice(0, 8).map((row) => ({
                key: `${row.label}${row.page}`, label: <span className="font-semibold">“{row.label}”</span>, value: row.clicks, detail: row.page, unit: 'clicks',
              }))} />
            </Card>

            <Card title="Added to basket" id="basket">
              <Ranked loading={loading} empty="Nothing added to a basket in this period yet." rows={data?.basket?.map((row) => ({
                key: row.slug, label: <span className="font-semibold">{row.label}</span>, value: row.adds, unit: 'adds',
              }))} />
            </Card>
            <Card title="Frustrating pages" id="frustration" hint="Rage clicks (fast repeated clicks), clicks that did nothing, and page errors.">
              <Frustration rows={data?.frustration} loading={loading} />
            </Card>
            <Card title="Page speed" id="speed" hint="How fast pages feel for most visitors (75th percentile)." className="lg:col-span-2 xl:col-span-4">
              <Vitals data={data?.vitals} loading={loading} />
            </Card>
          </div>

          {errors.length > 0 && (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-status-warning/40 bg-status-warning-bg p-4 text-sm text-status-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Some numbers could not be loaded from PostHog.</p>
                <ul className="mt-1 list-disc pl-5 text-xs">{[...new Set(errors)].map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotConnected() {
  return (
    <div className="w-full">
      <PageHeader eyebrow="Website" title="Visitors" description="How people find and use the website." />
      <EmptyState icon={Globe} title="Connect PostHog to see visitors" description="Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to apps/admin-next/.env.local, then restart the admin." />
    </div>
  );
}

function Card({ title, id, hint, children, className }: { title: string; id: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0 rounded-2xl border bg-card p-5 xl:col-span-4', className)}>
      <h2 id={id} className="text-sm font-extrabold tracking-[0.14em] uppercase">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** "+12% vs. before": green when it got better, red when worse (for bounce rate, lower is better). */
function Change({ value, points, lowerIsBetter }: { value: number | null | undefined; points?: boolean; lowerIsBetter?: boolean }) {
  if (value === undefined) return null;
  if (value === null) return <span className="text-[11px] text-muted-foreground">No earlier visits to compare</span>;
  const rounded = Math.round(value * 100);
  if (rounded === 0) return <span className="text-[11px] text-muted-foreground">Same as before</span>;
  const up = rounded > 0;
  const better = lowerIsBetter ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', better ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger')}>
      <Arrow className="size-3" aria-hidden />
      {up ? '+' : '−'}{Math.abs(rounded)}{points ? ' pts' : '%'}
      <span className="sr-only"> compared with the period before</span>
    </span>
  );
}

function Kpi({ label, hint, value, change, points, lowerIsBetter, className }: {
  label: string; hint: string; value: string | null | undefined; change: number | null | undefined; points?: boolean; lowerIsBetter?: boolean; className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-2xl border-2 border-foreground bg-card p-4 sm:p-5', className)}>
      <p className="text-sm font-bold">{label}</p>
      <div className="mt-2 truncate font-heading text-3xl leading-none font-bold tracking-tight tabular-nums sm:text-4xl">
        {value === undefined ? <Skeleton className="h-9 w-20" /> : value ?? '–'}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-auto pt-2">{value === undefined ? <Skeleton className="h-4 w-16" /> : <Change value={change} points={points} lowerIsBetter={lowerIsBetter} />}</div>
    </div>
  );
}

/* ── Live ── */

const eventLooks: Record<string, { icon: LucideIcon; verb: string }> = {
  $pageview: { icon: Eye, verb: 'Viewed' },
  $autocapture: { icon: MousePointerClick, verb: 'Clicked' },
  $rageclick: { icon: Zap, verb: 'Rage clicked on' },
  basket_added: { icon: ShoppingBasket, verb: 'Added to basket' },
  checkout_started: { icon: CreditCard, verb: 'Started checkout' },
  purchase_completed: { icon: BadgeCheck, verb: 'Paid' },
};

const deviceIcon = (device: string): LucideIcon => (device === 'Mobile' ? Smartphone : device === 'Tablet' ? Tablet : Monitor);

function timeAgo(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

/** `now` is when the numbers arrived, so "2 min ago" matches the moment they were fetched. */
function LiveNow({ data, loading, now }: { data: Live | undefined; loading: boolean; now: number }) {
  const count = data?.visitorsNow;
  return (
    <section aria-labelledby="live-heading" className="grid gap-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_var(--hard-shadow)] lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1.3fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="grid content-start gap-2">
        <h2 id="live-heading" className="flex items-center gap-2 text-sm font-extrabold tracking-[0.14em] uppercase">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-status-success" />
          </span>
          On the site now
        </h2>
        <div className="font-heading text-6xl leading-none font-bold tracking-tight tabular-nums" aria-live="polite">
          {loading || count === undefined ? <Skeleton className="h-14 w-16" /> : count === null ? '–' : n(count)}
        </div>
        <p className="text-xs text-muted-foreground">Visitors in the last 5 minutes. Updates every 15 seconds.</p>
      </div>

      <div className="min-w-0">
        <h3 className="mb-3 text-xs font-bold text-muted-foreground">Pages viewed (last 5 min)</h3>
        {loading ? <Skeleton className="h-24 w-full" /> : data?.pages?.length ? (
          <ul className="grid gap-2">
            {data.pages.map((page) => (
              <li key={page.path} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <PathLabel path={page.path} />
                <span className="shrink-0 font-semibold tabular-nums">{n(page.visitors)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nobody right now.</p>}
      </div>

      <div className="min-w-0">
        <h3 className="mb-3 text-xs font-bold text-muted-foreground">Latest activity (last hour)</h3>
        {loading ? <Skeleton className="h-40 w-full" /> : data?.activity?.length ? (
          <ol className="grid max-h-60 gap-1 overflow-y-auto pr-1">
            {data.activity.map((item, index) => {
              const look = eventLooks[item.event] ?? { icon: Eye, verb: item.event };
              const Device = deviceIcon(item.device);
              return (
                <li key={`${item.at}-${index}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-muted/50">
                  <span className="grid size-7 place-items-center rounded-full bg-secondary text-brand-text" aria-hidden><look.icon className="size-3.5" /></span>
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{look.verb}</span>{' '}
                    {item.event === '$autocapture' && item.label ? <>“{item.label}” on </> : null}
                    {item.event === 'basket_added' && item.program ? <>{item.program} </> : null}
                    {item.event !== 'basket_added' && <span className="text-muted-foreground">{item.path}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Device className="size-3.5" aria-label={item.device || 'Device'} />
                    {timeAgo(item.at, now)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-muted-foreground">No activity in the last hour.</p>}
      </div>
    </section>
  );
}

/* ── History ── */

function VisitorsChart({ daily, loading, className }: { daily: Stats['daily'] | undefined; loading: boolean; className?: string }) {
  const [metric, setMetric] = useState<Metric>('visitors');
  return (
    <section aria-labelledby="per-day" className={cn('min-w-0 rounded-2xl border bg-card p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="per-day" className="text-sm font-extrabold tracking-[0.14em] uppercase">{metric === 'visitors' ? 'Visitors' : 'Page views'} per day</h2>
        <ToggleGroup type="single" size="sm" variant="outline" value={metric} onValueChange={(next) => next && setMetric(next as Metric)} aria-label="Show">
          <ToggleGroupItem value="visitors" className="px-3 text-xs">Visitors</ToggleGroupItem>
          <ToggleGroupItem value="pageviews" className="px-3 text-xs">Page views</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {loading ? <Skeleton className="h-72 w-full" /> : daily ? (
        <ChartContainer config={metricChart} className="h-72 w-full">
          <AreaChart data={daily} margin={{ left: 4, right: 8, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(label) => shortDay(String(label))} />} />
            <Area dataKey={metric} type="monotone" stroke={`var(--color-${metric})`} fill={`var(--color-${metric})`} fillOpacity={0.35} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      ) : <p className="grid h-72 place-items-center text-sm text-muted-foreground">Could not load this chart.</p>}
    </section>
  );
}

/** From visiting to paying: how many people reached each step, and what share of all visitors that is. */
function Funnel({ steps, loading, className }: { steps: Stats['funnel'] | undefined; loading: boolean; className?: string }) {
  const first = steps?.[0]?.people ?? 0;
  return (
    <section aria-labelledby="funnel" className={cn('min-w-0 rounded-2xl border bg-card p-5', className)}>
      <h2 id="funnel" className="text-sm font-extrabold tracking-[0.14em] uppercase">From visit to sale</h2>
      <p className="mt-1 text-xs text-muted-foreground">How many people reached each step.</p>
      {loading ? <Skeleton className="mt-4 h-56 w-full" /> : steps ? (
        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          {steps.map((step, index) => {
            const previous = index > 0 ? steps[index - 1]!.people : 0;
            return (
              <li key={step.step} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">{step.step}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{n(step.people)}</span>
                    <span className="text-muted-foreground"> · {percent(step.people, first)}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-tone-terracotta" style={{ width: `${first ? Math.max((step.people / first) * 100, step.people ? 2 : 0) : 0}%` }} />
                </div>
                {index > 0 && previous > 0 && <span className="text-[11px] text-muted-foreground">{percent(step.people, previous)} of the step before</span>}
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-4 text-sm text-muted-foreground">Could not load the steps.</p>}
    </section>
  );
}

/** Pages with visitors, views, time on page, how far people scroll and bounce rate (PostHog's Paths table, plus more). */
function PagesTable({ rows, loading }: { rows: Stats['pages'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!rows) return <p className="text-sm text-muted-foreground">Could not load the pages.</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No page views in this period yet.</p>;
  const most = Math.max(...rows.map((row) => row.visitors), 1);
  const head = 'px-2 py-2 text-right text-[11px] font-bold tracking-wide text-muted-foreground uppercase';
  const cell = 'px-2 py-2.5 text-right tabular-nums';
  return (
    <div className="relative -mx-2 overflow-x-auto">
      <table className="w-full min-w-0 table-fixed text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(head, 'w-auto text-left')}>Page</th>
            <th scope="col" className={cn(head, 'w-20')}>Visitors</th>
            <th scope="col" className={cn(head, 'w-16')}>Views</th>
            <th scope="col" className={cn(head, 'hidden w-20 md:table-cell')}>Time</th>
            <th scope="col" className={cn(head, 'hidden w-20 md:table-cell')}>Scrolled</th>
            <th scope="col" className={cn(head, 'hidden w-20 sm:table-cell')}>Bounce</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path} className="border-b last:border-b-0">
              <td className="relative px-2 py-2.5">
                <span className="absolute inset-y-1 left-0 rounded-md bg-tone-sage/35" style={{ width: `${Math.max((row.visitors / most) * 100, 2)}%` }} aria-hidden />
                <span className="relative flex min-w-0"><PathLabel path={row.path} /></span>
              </td>
              <td className={cn(cell, 'font-semibold')}>{n(row.visitors)}</td>
              <td className={cell}>{n(row.views)}</td>
              <td className={cn(cell, 'hidden md:table-cell')}>{row.seconds === null ? '–' : duration(row.seconds)}</td>
              <td className={cn(cell, 'hidden md:table-cell')}>{row.scrolled === null ? '–' : share(Math.min(row.scrolled, 1))}</td>
              <td className={cn(cell, 'hidden sm:table-cell')}>{row.bounceRate === null ? '–' : share(row.bounceRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** Weekday by hour: darker squares had more visitors. */
function Heatmap({ cells, loading }: { cells: Stats['hours'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-56 w-full" />;
  if (!cells) return <p className="text-sm text-muted-foreground">Could not load the busiest times.</p>;
  if (!cells.length) return <p className="py-8 text-center text-sm text-muted-foreground">No visits in this period yet.</p>;
  const grid = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.visitors]));
  const most = Math.max(...cells.map((cell) => cell.visitors), 1);
  const busiest = cells.reduce((top, cell) => (cell.visitors > top.visitors ? cell : top), cells[0]!);
  const byDay = WEEKDAYS.map((_, index) => cells.filter((cell) => cell.weekday === index + 1).reduce((sum, cell) => sum + cell.visitors, 0));
  const topDay = byDay.indexOf(Math.max(...byDay));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <p className="text-sm">
        Busiest hour: <span className="font-semibold">{WEEKDAY_NAMES[busiest.weekday - 1]} {hourLabel(busiest.hour)}</span>
        <span className="text-muted-foreground"> · busiest day: </span><span className="font-semibold">{WEEKDAY_NAMES[topDay]}</span>
      </p>
      <div className="relative overflow-x-auto pb-1">
        <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-[3px] text-[10px]">
          <caption className="sr-only">Visitors per weekday and hour</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9"><span className="sr-only">Day</span></th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} scope="col" className="font-medium text-muted-foreground">{hour % 3 === 0 ? String(hour).padStart(2, '0') : <span className="sr-only">{hour}</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day, index) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-left font-semibold text-muted-foreground">{day}</th>
                {Array.from({ length: 24 }, (_, hour) => {
                  const visitors = grid.get(`${index + 1}-${hour}`) ?? 0;
                  return (
                    <td key={hour} className="h-6 rounded-[4px] bg-muted p-0" title={`${WEEKDAY_NAMES[index]} ${hourLabel(hour)}: ${n(visitors)} visitor${visitors === 1 ? '' : 's'}`}>
                      {visitors > 0 && <span className="block size-full rounded-[4px] bg-tone-terracotta" style={{ opacity: 0.2 + 0.8 * (visitors / most) }} />}
                      <span className="sr-only">{n(visitors)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground" aria-hidden>
        Fewer
        {[0.2, 0.45, 0.7, 1].map((opacity) => <span key={opacity} className="size-3 rounded-[3px] bg-tone-terracotta" style={{ opacity }} />)}
        More
      </div>
    </div>
  );
}

interface RankedRow { key: string; label: ReactNode; value: number; detail?: string; unit: string }

/** A short ranked list: the numbers are written out; the thin bar only shows each row against the top one. */
function Ranked({ rows, loading, empty, tone = 'bg-tone-sage' }: { rows: RankedRow[] | undefined; loading: boolean; empty: string; tone?: string }) {
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!rows) return <p className="text-sm text-muted-foreground">Could not load this list.</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const most = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
      {rows.map((row) => (
        <li key={row.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}{row.detail && <span className="text-muted-foreground"> · {row.detail}</span>}</span>
            <span className="shrink-0 tabular-nums"><span className="font-semibold">{n(row.value)}</span> <span className="text-muted-foreground">{row.value === 1 ? row.unit.replace(/s$/, '') : row.unit}</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-muted" aria-hidden>
            <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max((row.value / most) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Devices({ data, loading }: { data: Stats['devices'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">Could not load devices.</p>;
  const total = data.types.reduce((sum, row) => sum + row.visitors, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted-foreground">No visits in this period yet.</p>;
  const list = (title: string, rows: { name: string; visitors: number }[]) => (
    <div className="min-w-0">
      <h3 className="mb-2 text-xs font-bold text-muted-foreground">{title}</h3>
      <ul className="grid gap-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.name} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{percent(row.visitors, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-5">
      <ul className="grid grid-cols-3 gap-3">
        {data.types.slice(0, 3).map((row) => {
          const Icon = deviceIcon(row.name);
          return (
            <li key={row.name} className="grid min-w-0 justify-items-start gap-1 rounded-xl bg-muted/50 p-3">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-heading text-2xl leading-none font-bold tabular-nums">{percent(row.visitors, total)}</span>
              <span className="max-w-full truncate text-xs text-muted-foreground">{row.name} · {n(row.visitors)}</span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-4">
        {list('Browser', data.browsers)}
        {list('System', data.systems)}
      </div>
    </div>
  );
}

function Frustration({ rows, loading }: { rows: Stats['frustration'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!rows) return <p className="text-sm text-muted-foreground">Could not load this list.</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No rage clicks or page errors in this period.</p>;
  const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? '' : 's'}`;
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.path} className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <PathLabel path={row.path} />
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {row.rageClicks > 0 && <span className="font-semibold text-status-danger">{plural(row.rageClicks, 'rage click')}</span>}
            {row.deadClicks > 0 && <span>{plural(row.deadClicks, 'click')} that did nothing</span>}
            {row.errors > 0 && <span>{plural(row.errors, 'page error')}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Google's limits for "good" and "poor" (Core Web Vitals). */
const VITALS = [
  { key: 'lcp', name: 'Largest paint', hint: 'Main content visible', good: 2500, poor: 4000, show: (v: number) => `${(v / 1000).toFixed(1)}s` },
  { key: 'inp', name: 'Response to taps', hint: 'Reaction to clicks', good: 200, poor: 500, show: (v: number) => `${Math.round(v)}ms` },
  { key: 'cls', name: 'Layout shift', hint: 'Content jumping', good: 0.1, poor: 0.25, show: (v: number) => v.toFixed(2) },
  { key: 'fcp', name: 'First paint', hint: 'Something on screen', good: 1800, poor: 3000, show: (v: number) => `${(v / 1000).toFixed(1)}s` },
] as const;

function Vitals({ data, loading }: { data: Stats['vitals'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">Could not load page speed.</p>;
  if (!data.samples) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No speed measurements yet. Switch on “Web vitals autocapture” in the PostHog project settings to see them here.</p>;
  }
  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-2">
        {VITALS.map((vital) => {
          const value = data[vital.key];
          const rating = value === null ? null : value <= vital.good ? 'Good' : value <= vital.poor ? 'Needs work' : 'Poor';
          return (
            <li key={vital.key} className="grid min-w-0 gap-1 rounded-xl bg-muted/50 p-3">
              <span className="truncate text-xs font-bold">{vital.name}</span>
              <span className="font-heading text-2xl leading-none font-bold tabular-nums">{value === null ? '–' : vital.show(value)}</span>
              {rating && (
                <span className={cn('justify-self-start rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  rating === 'Good' ? 'bg-status-success-bg text-status-success' : rating === 'Poor' ? 'bg-status-danger-bg text-status-danger' : 'bg-status-warning-bg text-status-warning')}>
                  {rating}
                </span>
              )}
              <span className="truncate text-[11px] text-muted-foreground">{vital.hint}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">From {n(data.samples)} page load{data.samples === 1 ? '' : 's'}.</p>
    </div>
  );
}

/** "/program" shown as "Programs (/program)" for the main pages, so the list reads in plain words. */
const pageNames: Record<string, string> = {
  '/': 'Home', '/program': 'Programs', '/about': 'About', '/contact': 'Contact', '/checkout': 'Checkout',
  '/checkout/complete': 'Payment result', '/blog': 'Blog', '/kitchen': 'Kitchen', '/privacy': 'Privacy policy', '/refund-policy': 'Refund policy',
};

function PathLabel({ path }: { path: string }) {
  const name = pageNames[path.replace(/\/$/, '') || '/'];
  return (
    <span className="min-w-0 truncate">
      {name ? <><span className="font-semibold">{name}</span> <span className="text-muted-foreground">{path}</span></> : <span className="font-semibold">{path}</span>}
    </span>
  );
}
