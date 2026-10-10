'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck, CreditCard, ExternalLink, Eye, Globe, Monitor, MousePointerClick, ShoppingBasket, Smartphone, Tablet, TriangleAlert,
  type LucideIcon,
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

/** The default matches the server: your own test visits on localhost, the website everywhere else. */
const subscribeNever = () => () => {};
function useDefaultSite(): Site {
  return useSyncExternalStore(subscribeNever, () => (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? 'testing' : 'live'), () => 'live');
}

/** Website: visitors, pages, sources, clicks and the buying funnel from PostHog, plus who is on the site now. */
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

  return (
    <div className="mx-auto w-full max-w-6xl">
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
        <ToggleGroup type="single" variant="outline" value={String(days)} onValueChange={(value) => value && setDays(Number(value))} className="bg-card" aria-label="Period">
          {PERIODS.map((item) => <ToggleGroupItem key={item} value={String(item)} className="px-4">{item} days</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={site} onValueChange={(value) => value && setSite(value as Site)} className="bg-card" aria-label="Which visits">
          <ToggleGroupItem value="live" className="px-4">Live website</ToggleGroupItem>
          <ToggleGroupItem value="testing" className="px-4">My testing</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {stats.error ? (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-6 text-sm font-medium text-destructive">{stats.error.message}</div>
      ) : (
        <div className="grid gap-6">
          <LiveNow data={liveData} loading={live.isPending} now={live.dataUpdatedAt} />

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <Kpi label="Visitors" hint="Each person once a day" value={data?.totals && n(data.totals.visitors)} />
            <Kpi label="Page views" hint="Pages opened" value={data?.totals && n(data.totals.pageviews)} />
            <Kpi label="Visits" hint="Sessions on the site" value={data?.totals && n(data.totals.sessions)} />
            <Kpi label="Clicks" hint="Buttons and links" value={data?.totals && n(data.totals.clicks)} />
            <Kpi label="Basket adds" hint="Programs added" value={data?.totals && n(data.totals.basketAdds)} className="col-span-2 lg:col-span-1" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <VisitorsChart daily={data?.daily} loading={stats.isPending} />
            <Funnel steps={data?.funnel} loading={stats.isPending} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Top pages" id="top-pages">
              <Ranked loading={stats.isPending} empty="No page views in this period yet." rows={data?.pages?.map((row) => ({ key: row.path, label: <PathLabel path={row.path} />, value: row.views, detail: `${n(row.visitors)} visitor${row.visitors === 1 ? '' : 's'}`, unit: 'views' }))} />
            </Card>
            <Card title="Most clicked" id="top-clicks" hint="What people click, and on which page.">
              <Ranked loading={stats.isPending} empty="No clicks in this period yet." tone="bg-tone-caramel" rows={data?.clicks?.map((row) => ({ key: `${row.label}${row.page}`, label: <span className="font-semibold">“{row.label}”</span>, value: row.clicks, detail: row.page, unit: 'clicks' }))} />
            </Card>
            <Card title="Where visitors come from" id="sources">
              <Ranked loading={stats.isPending} empty="No visits in this period yet." tone="bg-tone-sand" rows={data?.sources?.map((row) => ({ key: row.name, label: <span className="font-semibold">{row.name}</span>, value: row.visitors, unit: 'visitors' }))} />
            </Card>
            <div className="grid gap-4">
              <Card title="Phone or computer" id="devices">
                <Devices rows={data?.devices} loading={stats.isPending} />
              </Card>
              <Card title="Added to basket" id="basket">
                <Ranked loading={stats.isPending} empty="Nothing added to a basket in this period yet." rows={data?.basket?.map((row) => ({ key: row.slug, label: <span className="font-semibold">{row.label}</span>, value: row.adds, unit: 'adds' }))} />
              </Card>
            </div>
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
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader eyebrow="Website" title="Visitors" description="How people find and use the website." />
      <EmptyState icon={Globe} title="Connect PostHog to see visitors" description="Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to apps/admin-next/.env.local, then restart the admin." />
    </div>
  );
}

function Card({ title, id, hint, children, className }: { title: string; id: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0 rounded-2xl border bg-card p-5', className)}>
      <h2 id={id} className="text-sm font-extrabold tracking-[0.14em] uppercase">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Kpi({ label, hint, value, className }: { label: string; hint: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-2xl border-2 border-foreground bg-card p-4 sm:p-5', className)}>
      <p className="text-sm font-bold">{label}</p>
      <div className="mt-2 font-heading text-3xl leading-none font-bold tracking-tight tabular-nums sm:text-4xl">
        {value === undefined ? <Skeleton className="h-9 w-20" /> : value ?? '–'}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ── Live ── */

const eventLooks: Record<string, { icon: LucideIcon; verb: string }> = {
  $pageview: { icon: Eye, verb: 'Viewed' },
  $autocapture: { icon: MousePointerClick, verb: 'Clicked' },
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
    <section aria-labelledby="live-heading" className="grid gap-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_var(--hard-shadow)] lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1.3fr)]">
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

function VisitorsChart({ daily, loading }: { daily: Stats['daily'] | undefined; loading: boolean }) {
  const [metric, setMetric] = useState<Metric>('visitors');
  return (
    <section aria-labelledby="per-day" className="min-w-0 rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="per-day" className="text-sm font-extrabold tracking-[0.14em] uppercase">{metric === 'visitors' ? 'Visitors' : 'Page views'} per day</h2>
        <ToggleGroup type="single" size="sm" variant="outline" value={metric} onValueChange={(value) => value && setMetric(value as Metric)} aria-label="Show">
          <ToggleGroupItem value="visitors" className="px-3 text-xs">Visitors</ToggleGroupItem>
          <ToggleGroupItem value="pageviews" className="px-3 text-xs">Page views</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {loading ? <Skeleton className="h-64 w-full" /> : daily ? (
        <ChartContainer config={metricChart} className="h-64 w-full">
          <AreaChart data={daily} margin={{ left: 4, right: 8, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(label) => shortDay(String(label))} />} />
            <Area dataKey={metric} type="monotone" stroke={`var(--color-${metric})`} fill={`var(--color-${metric})`} fillOpacity={0.35} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      ) : <p className="grid h-64 place-items-center text-sm text-muted-foreground">Could not load this chart.</p>}
    </section>
  );
}

/** From visiting to paying: how many people reached each step, and what share of all visitors that is. */
function Funnel({ steps, loading }: { steps: Stats['funnel'] | undefined; loading: boolean }) {
  const first = steps?.[0]?.people ?? 0;
  return (
    <section aria-labelledby="funnel" className="min-w-0 rounded-2xl border bg-card p-5">
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

function Devices({ rows, loading }: { rows: Stats['devices'] | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (!rows) return <p className="text-sm text-muted-foreground">Could not load devices.</p>;
  const total = rows.reduce((sum, row) => sum + row.visitors, 0);
  if (!total) return <p className="py-4 text-center text-sm text-muted-foreground">No visits in this period yet.</p>;
  return (
    <ul className="grid grid-cols-3 gap-3">
      {rows.slice(0, 3).map((row) => {
        const Icon = deviceIcon(row.name);
        return (
          <li key={row.name} className="grid justify-items-start gap-1 rounded-xl bg-muted/50 p-3">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-heading text-2xl leading-none font-bold tabular-nums">{percent(row.visitors, total)}</span>
            <span className="text-xs text-muted-foreground">{row.name} · {n(row.visitors)}</span>
          </li>
        );
      })}
    </ul>
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
