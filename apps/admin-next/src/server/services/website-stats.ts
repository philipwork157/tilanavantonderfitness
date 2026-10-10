import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { programs, volumes, type Database } from '@tilana/db';
import { logger } from '@/server/logger';
import { num, postHogQuery, text, type PostHogSettings } from './posthog';

/*
 * The Website page: visitors, pages, sources, clicks and the buying funnel
 * from PostHog (cookieless), plus who is on the site right now.
 * Visitors are counted per day (PostHog's cookieless code changes daily), so
 * someone who comes back on another day counts again.
 */

export const WEBSITE_PERIODS = [7, 30, 90] as const;
export type WebsitePeriod = (typeof WEBSITE_PERIODS)[number];
/** Which events to show: the live website, or test visits from someone's laptop. */
export type SiteEnvironment = 'production' | 'development';

const HISTORY_MAX_AGE = 5 * 60_000;
const LIVE_MAX_AGE = 15_000;

/** Every query looks at one environment only; both values are fixed strings, never user text. */
const envFilter = (env: SiteEnvironment) => `properties.site_environment = '${env === 'production' ? 'production' : 'development'}'`;
const since = (days: WebsitePeriod) => `timestamp >= now() - INTERVAL ${Number(days)} DAY`;

/** Text of a clicked element: PostHog's own text, else the element's text or label from its HTML chain. */
const CLICK_LABEL = `coalesce(
  nullIf(trim(toString(properties.$el_text)), ''),
  nullIf(extract(elements_chain, 'text="([^"]{1,80})"'), ''),
  nullIf(extract(elements_chain, 'attr__aria-label="([^"]{1,80})"'), ''),
  'Unnamed button or link')`;

/** Friendly names for where visitors came from. */
export function sourceName(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/^www\./, '');
  if (!value || value === '$direct') return 'Direct or app';
  const known: [RegExp, string][] = [
    [/(^|\.)google\./, 'Google'],
    [/(^|\.)bing\.com$/, 'Bing'],
    [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
    [/instagram\.com$/, 'Instagram'],
    [/(facebook\.com|fb\.me|^fb$)/, 'Facebook'],
    [/(whatsapp\.com|wa\.me|^whatsapp$)/, 'WhatsApp'],
    [/(tiktok\.com|^tiktok$)/, 'TikTok'],
    [/(pinterest\.|pin\.it)/, 'Pinterest'],
    [/(youtube\.com|youtu\.be|^youtube$)/, 'YouTube'],
    [/(linkedin\.com|lnkd\.in)/, 'LinkedIn'],
    [/(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'],
    [/(mail\.google|outlook\.|^newsletter$|^email$)/, 'Email'],
  ];
  return known.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}

/** Fills days without visits with zeros, oldest first (dates as YYYY-MM-DD in South Africa). */
export function fillDays(rows: { date: string; visitors: number; pageviews: number }[], days: number, today = new Date()) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const day = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date(today.getTime() - offset * 86_400_000));
  return Array.from({ length: days }, (_, i) => {
    const date = day(days - 1 - i);
    return byDate.get(date) ?? { date, visitors: 0, pageviews: 0 };
  });
}

/** Runs one part of the page; a failed part shows a short note instead of breaking the page. */
async function part<T>(name: string, work: () => Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    logger.warn({ err: error, part: name }, 'Website stats: PostHog query failed');
    errors.push(`${name}: ${error instanceof Error ? error.message : 'failed'}`);
    return null;
  }
}

/** "Beginner · Volume 1" for each program slug that was added to a basket. */
async function programLabels(db: Database, slugs: string[]): Promise<Map<string, string>> {
  if (!slugs.length) return new Map();
  try {
    const rows = await db.select({ slug: programs.slug, name: programs.name, volume: volumes.name })
      .from(programs).innerJoin(volumes, eq(volumes.id, programs.volumeId))
      .where(inArray(programs.slug, slugs)).orderBy(asc(programs.name));
    return new Map(rows.map((row) => [row.slug, `${row.name} · ${row.volume}`]));
  } catch (error) {
    // Names are a nicety: without the database the web addresses are shown instead.
    logger.warn({ err: error }, 'Website stats: program names unavailable');
    return new Map();
  }
}

export async function websiteStats(db: Database, settings: PostHogSettings, days: WebsitePeriod, env: SiteEnvironment) {
  const where = `${since(days)} AND ${envFilter(env)}`;
  const q = (name: string, sql: string) => postHogQuery(settings, name, sql, HISTORY_MAX_AGE);
  const errors: string[] = [];

  const [summary, daily, pages, sources, devices, clicks, basket] = await Promise.all([
    part('Totals', async () => {
      const [row] = await q('totals', `
        SELECT
          uniqIf(distinct_id, event = '$pageview'),
          countIf(event = '$pageview'),
          uniqIf(properties.$session_id, event = '$pageview'),
          uniqIf(distinct_id, event = '$pageview' AND properties.$pathname LIKE '/program%'),
          uniqIf(distinct_id, event = 'basket_added'),
          uniqIf(distinct_id, event = 'checkout_started'),
          uniqIf(distinct_id, event = 'purchase_completed'),
          countIf(event = '$autocapture')
        FROM events WHERE ${where}`);
      const r = row ?? [];
      return {
        visitors: num(r[0]), pageviews: num(r[1]), sessions: num(r[2]), programViewers: num(r[3]),
        basketAdders: num(r[4]), checkoutStarters: num(r[5]), buyers: num(r[6]), clicks: num(r[7]),
      };
    }, errors),
    part('Visitors per day', async () => {
      const rows = await q('daily', `
        SELECT toString(toDate(toTimeZone(timestamp, 'Africa/Johannesburg'))) AS day, uniq(distinct_id), count()
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY day ORDER BY day`);
      return fillDays(rows.map((r) => ({ date: text(r[0]).slice(0, 10), visitors: num(r[1]), pageviews: num(r[2]) })), days);
    }, errors),
    part('Top pages', async () => {
      const rows = await q('pages', `
        SELECT coalesce(toString(properties.$pathname), '/') AS page, count() AS views, uniq(distinct_id)
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY page ORDER BY views DESC LIMIT 10`);
      return rows.map((r) => ({ path: text(r[0]) || '/', views: num(r[1]), visitors: num(r[2]) }));
    }, errors),
    part('Where visitors come from', async () => {
      const rows = await q('sources', `
        SELECT coalesce(nullIf(toString(properties.utm_source), ''), nullIf(toString(properties.$referring_domain), ''), '$direct') AS source, uniq(distinct_id) AS visitors
        FROM events WHERE ${where} AND event = '$pageview'
          AND coalesce(toString(properties.$referring_domain), '') != coalesce(toString(properties.$host), '')
        GROUP BY source ORDER BY visitors DESC LIMIT 30`);
      // Several raw sources can share a friendly name (google.com, google.co.za).
      const merged = new Map<string, number>();
      for (const r of rows) merged.set(sourceName(text(r[0])), (merged.get(sourceName(text(r[0]))) ?? 0) + num(r[1]));
      return [...merged].map(([name, visitors]) => ({ name, visitors })).sort((a, b) => b.visitors - a.visitors).slice(0, 8);
    }, errors),
    part('Devices', async () => {
      const rows = await q('devices', `
        SELECT coalesce(toString(properties.$device_type), 'Unknown') AS device, uniq(distinct_id) AS visitors
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY device ORDER BY visitors DESC`);
      return rows.map((r) => ({ name: text(r[0]) || 'Unknown', visitors: num(r[1]) }));
    }, errors),
    part('Most clicked', async () => {
      const rows = await q('clicks', `
        SELECT ${CLICK_LABEL} AS label, coalesce(toString(properties.$pathname), '/') AS page, count() AS clicks
        FROM events WHERE ${where} AND event = '$autocapture' AND properties.$event_type = 'click'
        GROUP BY label, page ORDER BY clicks DESC LIMIT 12`);
      return rows.map((r) => ({ label: text(r[0]).replace(/\s+/g, ' ').trim(), page: text(r[1]) || '/', clicks: num(r[2]) }));
    }, errors),
    part('Added to basket', async () => {
      const rows = await q('basket', `
        SELECT toString(properties.program) AS program, count() AS adds
        FROM events WHERE ${where} AND event = 'basket_added'
        GROUP BY program ORDER BY adds DESC LIMIT 10`);
      const labels = await programLabels(db, rows.map((r) => text(r[0])).filter(Boolean));
      return rows.map((r) => ({ slug: text(r[0]), label: labels.get(text(r[0])) ?? text(r[0]), adds: num(r[1]) }));
    }, errors),
  ]);

  return {
    configured: true as const,
    environment: env,
    days,
    totals: summary && {
      visitors: summary.visitors,
      pageviews: summary.pageviews,
      sessions: summary.sessions,
      clicks: summary.clicks,
      basketAdds: basket?.reduce((total, row) => total + row.adds, 0) ?? summary.basketAdders,
    },
    funnel: summary && [
      { step: 'Visited the website', people: summary.visitors },
      { step: 'Looked at the programs', people: summary.programViewers },
      { step: 'Added to basket', people: summary.basketAdders },
      { step: 'Started checkout', people: summary.checkoutStarters },
      { step: 'Paid', people: summary.buyers },
    ],
    daily,
    pages,
    sources,
    devices,
    clicks,
    basket,
    errors,
    postHogUrl: `${settings.host}/project/${settings.projectId}`,
  };
}

/** Who is on the site in the last 5 minutes, what they are looking at, and the latest actions. */
export async function liveStats(db: Database, settings: PostHogSettings, env: SiteEnvironment) {
  const q = (name: string, sql: string) => postHogQuery(settings, name, sql, LIVE_MAX_AGE);
  const errors: string[] = [];
  const recentWhere = `timestamp >= now() - INTERVAL 5 MINUTE AND ${envFilter(env)}`;

  const [now, pages, activity] = await Promise.all([
    part('Live visitors', async () => {
      const [row] = await q('live visitors', `SELECT uniq(distinct_id) FROM events WHERE ${recentWhere}`);
      return num(row?.[0]);
    }, errors),
    part('Pages right now', async () => {
      const rows = await q('live pages', `
        SELECT coalesce(toString(properties.$pathname), '/') AS page, uniq(distinct_id) AS visitors
        FROM events WHERE ${recentWhere} AND event = '$pageview'
        GROUP BY page ORDER BY visitors DESC LIMIT 6`);
      return rows.map((r) => ({ path: text(r[0]) || '/', visitors: num(r[1]) }));
    }, errors),
    part('Latest activity', async () => {
      const rows = await q('live activity', `
        SELECT toUnixTimestamp(timestamp), event, coalesce(toString(properties.$pathname), '/'), toString(properties.$device_type),
          toString(properties.program), if(event = '$autocapture', ${CLICK_LABEL}, '')
        FROM events
        WHERE timestamp >= now() - INTERVAL 60 MINUTE AND ${envFilter(env)}
          AND event IN ('$pageview', '$autocapture', 'basket_added', 'checkout_started', 'purchase_completed')
        ORDER BY timestamp DESC LIMIT 25`);
      const labels = await programLabels(db, [...new Set(rows.map((r) => text(r[4])).filter(Boolean))]);
      return rows.map((r) => ({
        /** Milliseconds since 1970 (UTC). */
        at: num(r[0]) * 1000,
        event: text(r[1]),
        path: text(r[2]) || '/',
        device: text(r[3]),
        program: labels.get(text(r[4])) ?? text(r[4]),
        label: text(r[5]).replace(/\s+/g, ' ').trim(),
      }));
    }, errors),
  ]);

  return { configured: true as const, environment: env, visitorsNow: now, pages, activity, errors };
}
