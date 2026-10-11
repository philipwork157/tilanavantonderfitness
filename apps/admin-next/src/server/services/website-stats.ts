import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { programs, volumes, type Database } from '@tilana/db';
import { logger } from '@/server/logger';
import { num, postHogQuery, text, type PostHogSettings } from './posthog';

/*
 * The Website page: visitors, visits, pages, channels, clicks and the buying
 * funnel from PostHog (cookieless), plus who is on the site right now.
 *
 * Visits (sessions), visit length, bounce rate, landing pages and channels
 * come from PostHog's own session data (the same numbers as PostHog's Web
 * analytics). If that data cannot be read, they are worked out from the page
 * views instead and the page says the numbers are approximate.
 *
 * Visitors are counted per day (PostHog's cookieless code changes daily), so
 * someone who comes back on another day counts again.
 */

export const WEBSITE_PERIODS = [7, 30, 90] as const;
export type WebsitePeriod = (typeof WEBSITE_PERIODS)[number];
/** Which events to show: the live website, or test visits from someone's laptop. */
export type SiteEnvironment = 'production' | 'development';

const HISTORY_MAX_AGE = 5 * 60_000;
const LIVE_MAX_AGE = 15_000;
const TIME_ZONE = 'Africa/Johannesburg';

/**
 * Every query looks at one environment only. Events without the label (sent
 * before it existed) count as testing, never as the live website.
 * Both values are fixed strings, never user text.
 */
const envFilter = (env: SiteEnvironment) => (env === 'production'
  ? `properties.site_environment = 'production'`
  : `ifNull(toString(properties.site_environment), '') != 'production'`);

/** Like PostHog's "Last 7 days": from the start of the day 7 days ago until now. */
const startOf = (days: number) => `toStartOfDay(now() - INTERVAL ${Number(days)} DAY)`;
const current = (days: WebsitePeriod) => `timestamp >= ${startOf(days)}`;
/** The same length of time just before, for the "vs. before" comparison. */
const currentAndPrevious = (days: WebsitePeriod) => `timestamp >= ${startOf(days * 2)}`;

/** Text of a clicked element: PostHog's own text, else the element's text or label from its HTML chain. */
const CLICK_LABEL = `coalesce(
  nullIf(trim(toString(properties.$el_text)), ''),
  nullIf(extract(elements_chain, 'text="([^"]{1,80})"'), ''),
  nullIf(extract(elements_chain, 'attr__aria-label="([^"]{1,80})"'), ''),
  'Unnamed button or link')`;

/**
 * One row per visit (session). `exact` uses PostHog's session data; otherwise
 * the visit is pieced together from its page views (length from first to last
 * page view, bounce = one page view, channel from the first referrer).
 */
function visitsSql(where: string, exact: boolean): string {
  return `
    SELECT
      any(distinct_id) AS visitor,
      min(timestamp) AS started,
      count() AS views,
      ${exact ? 'any(session.$session_duration)' : `dateDiff('second', min(timestamp), max(timestamp))`} AS duration,
      ${exact ? 'any(session.$is_bounce)' : 'count() = 1'} AS bounce,
      ${exact ? 'any(session.$entry_pathname)' : 'argMin(toString(properties.$pathname), timestamp)'} AS entry,
      ${exact ? 'any(session.$channel_type)' : `''`} AS channel,
      ${exact ? 'any(session.$entry_referring_domain)' : 'argMin(toString(properties.$referring_domain), timestamp)'} AS referrer
    FROM events
    WHERE ${where} AND event = '$pageview' AND properties.$session_id IS NOT NULL
    GROUP BY properties.$session_id`;
}

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

/** PostHog-style channel for a referrer, used only when PostHog's own channel is unavailable. */
export function channelFor(referrer: string): string {
  const name = sourceName(referrer);
  if (name === 'Direct or app') return 'Direct';
  if (['Google', 'Bing', 'DuckDuckGo'].includes(name)) return 'Organic Search';
  if (['Instagram', 'Facebook', 'WhatsApp', 'TikTok', 'Pinterest', 'YouTube', 'LinkedIn', 'X (Twitter)'].includes(name)) return 'Organic Social';
  if (name === 'Email') return 'Email';
  return 'Referral';
}

/** Fills days without visits with zeros, oldest first (dates as YYYY-MM-DD in South Africa). */
export function fillDays(rows: { date: string; visitors: number; pageviews: number }[], days: number, today = new Date()) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const day = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(today.getTime() - offset * 86_400_000));
  return Array.from({ length: days }, (_, i) => {
    const date = day(days - 1 - i);
    return byDate.get(date) ?? { date, visitors: 0, pageviews: 0 };
  });
}

/** Change against the period before, as a fraction (0.25 = 25% more); null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return (now - before) / before;
}

/** A number, or null when PostHog had none (e.g. no web vitals yet). */
const maybe = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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

/** Groups visitor counts by one name (device, browser, ...), largest first. */
function tally(rows: unknown[][], column: number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = text(row[column]) || 'Unknown';
    totals.set(name, (totals.get(name) ?? 0) + num(row[3]));
  }
  return [...totals].map(([name, visitors]) => ({ name, visitors })).sort((a, b) => b.visitors - a.visitors);
}

export async function websiteStats(db: Database, settings: PostHogSettings, days: WebsitePeriod, env: SiteEnvironment) {
  const where = `${current(days)} AND ${envFilter(env)}`;
  const q = (name: string, sql: string) => postHogQuery(settings, name, sql, HISTORY_MAX_AGE);
  const errors: string[] = [];
  let approximate = false;

  /** Visit-based queries: PostHog's session data first, the page-view estimate if that fails. */
  const visits = async (name: string, build: (exact: boolean) => string) => {
    try {
      return { rows: await q(name, build(true)), exact: true };
    } catch (error) {
      logger.warn({ err: error, part: name }, 'Website stats: session data unavailable, estimating from page views');
      approximate = true;
      return { rows: await q(`${name} (estimate)`, build(false)), exact: false };
    }
  };

  const [summary, overview, daily, pages, pageTime, landing, channelRows, devices, clicks, basket, hours, frustration, vitals] = await Promise.all([
    part('Totals', async () => {
      const now = current(days);
      const [row] = await q('totals', `
        SELECT
          uniqIf(distinct_id, ${now} AND event = '$pageview'),
          uniqIf(distinct_id, ${now} AND event = '$pageview' AND properties.$pathname LIKE '/program%'),
          uniqIf(distinct_id, ${now} AND event = 'basket_added'),
          uniqIf(distinct_id, ${now} AND event = 'checkout_started'),
          uniqIf(distinct_id, ${now} AND event = 'purchase_completed'),
          countIf(${now} AND event = '$autocapture'),
          countIf(NOT (${now}) AND event = '$autocapture'),
          countIf(${now} AND event = 'basket_added'),
          countIf(NOT (${now}) AND event = 'basket_added')
        FROM events WHERE ${currentAndPrevious(days)} AND ${envFilter(env)}
          AND event IN ('$pageview', '$autocapture', 'basket_added', 'checkout_started', 'purchase_completed')`);
      const r = row ?? [];
      return {
        visitors: num(r[0]), programViewers: num(r[1]), basketAdders: num(r[2]), checkoutStarters: num(r[3]), buyers: num(r[4]),
        clicks: num(r[5]), clicksBefore: num(r[6]), basketAdds: num(r[7]), basketAddsBefore: num(r[8]),
      };
    }, errors),
    part('Visits', async () => {
      const { rows } = await visits('overview', (exact) => `
        SELECT if(started >= ${startOf(days)}, 1, 0) AS is_current, uniq(visitor), sum(views), count(), avg(duration), avg(if(bounce, 1, 0))
        FROM (${visitsSql(`${currentAndPrevious(days)} AND ${envFilter(env)}`, exact)})
        GROUP BY is_current`);
      const pick = (flag: number) => {
        const r = rows.find((row) => num(row[0]) === flag) ?? [];
        return { visitors: num(r[1]), pageviews: num(r[2]), sessions: num(r[3]), duration: num(r[4]), bounceRate: num(r[5]) };
      };
      return { now: pick(1), before: pick(0) };
    }, errors),
    part('Visitors per day', async () => {
      const rows = await q('daily', `
        SELECT toString(toDate(toTimeZone(timestamp, '${TIME_ZONE}'))) AS day, uniq(distinct_id), count()
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY day ORDER BY day`);
      return fillDays(rows.map((r) => ({ date: text(r[0]).slice(0, 10), visitors: num(r[1]), pageviews: num(r[2]) })), days + 1);
    }, errors),
    part('Pages', async () => {
      const rows = await q('pages', `
        SELECT coalesce(toString(properties.$pathname), '/') AS page, uniq(distinct_id) AS visitors, count() AS views
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY page ORDER BY visitors DESC, views DESC LIMIT 15`);
      return rows.map((r) => ({ path: text(r[0]) || '/', visitors: num(r[1]), views: num(r[2]) }));
    }, errors),
    part('Time on page', async () => {
      // PostHog reports how long the previous page was open and how far it was scrolled on the next page view or page leave.
      const rows = await q('page time', `
        SELECT toString(properties.$prev_pageview_pathname) AS page,
          avg(toFloat(properties.$prev_pageview_duration)),
          avg(toFloat(properties.$prev_pageview_max_scroll_percentage))
        FROM events WHERE ${where} AND event IN ('$pageview', '$pageleave') AND properties.$prev_pageview_pathname IS NOT NULL
        GROUP BY page`);
      return new Map(rows.map((r) => [text(r[0]), { seconds: maybe(r[1]), scrolled: maybe(r[2]) }]));
    }, errors),
    part('Landing pages', async () => {
      const { rows } = await visits('landing pages', (exact) => `
        SELECT coalesce(nullIf(toString(entry), ''), '/') AS page, count() AS sessions, avg(if(bounce, 1, 0)), avg(duration)
        FROM (${visitsSql(where, exact)})
        GROUP BY page ORDER BY sessions DESC LIMIT 15`);
      return rows.map((r) => ({ path: text(r[0]) || '/', sessions: num(r[1]), bounceRate: num(r[2]), duration: num(r[3]) }));
    }, errors),
    part('Channels', async () => {
      const { rows, exact } = await visits('channels', (isExact) => `
        SELECT toString(channel), coalesce(nullIf(toString(referrer), ''), '$direct') AS ref, uniq(visitor), sum(views), count(), avg(if(bounce, 1, 0))
        FROM (${visitsSql(where, isExact)})
        GROUP BY channel, ref ORDER BY count() DESC LIMIT 200`);
      return rows.map((r) => ({
        channel: (exact ? text(r[0]) : '') || channelFor(text(r[1])),
        referrer: text(r[1]),
        visitors: num(r[2]), pageviews: num(r[3]), sessions: num(r[4]), bounces: num(r[5]) * num(r[4]),
      }));
    }, errors),
    part('Devices', async () => {
      const rows = await q('devices', `
        SELECT coalesce(toString(properties.$device_type), 'Unknown') AS device, coalesce(toString(properties.$browser), 'Unknown') AS browser,
          coalesce(toString(properties.$os), 'Unknown') AS os, uniq(distinct_id) AS visitors
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY device, browser, os ORDER BY visitors DESC LIMIT 200`);
      return { types: tally(rows, 0), browsers: tally(rows, 1).slice(0, 6), systems: tally(rows, 2).slice(0, 6) };
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
    part('Busiest times', async () => {
      const rows = await q('active hours', `
        SELECT toDayOfWeek(toTimeZone(timestamp, '${TIME_ZONE}')) AS weekday, toHour(toTimeZone(timestamp, '${TIME_ZONE}')) AS hour, uniq(distinct_id)
        FROM events WHERE ${where} AND event = '$pageview'
        GROUP BY weekday, hour`);
      /** Monday = 1 ... Sunday = 7, hours 0-23 in South African time. */
      return rows.map((r) => ({ weekday: num(r[0]), hour: num(r[1]), visitors: num(r[2]) }));
    }, errors),
    part('Frustration', async () => {
      const rows = await q('frustration', `
        SELECT coalesce(toString(properties.$pathname), '/') AS page,
          countIf(event = '$rageclick'), countIf(event = '$dead_click'), countIf(event = '$exception')
        FROM events WHERE ${where} AND event IN ('$rageclick', '$dead_click', '$exception')
        GROUP BY page ORDER BY count() DESC LIMIT 8`);
      return rows.map((r) => ({ path: text(r[0]) || '/', rageClicks: num(r[1]), deadClicks: num(r[2]), errors: num(r[3]) }));
    }, errors),
    part('Page speed', async () => {
      const [row] = await q('web vitals', `
        SELECT
          quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)),
          quantile(0.75)(toFloat(properties.$web_vitals_INP_value)),
          quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)),
          quantile(0.75)(toFloat(properties.$web_vitals_FCP_value)),
          count()
        FROM events WHERE ${where} AND event = '$web_vitals'`);
      const r = row ?? [];
      return { lcp: maybe(r[0]), inp: maybe(r[1]), cls: maybe(r[2]), fcp: maybe(r[3]), samples: num(r[4]) };
    }, errors),
  ]);

  const visitsNow = overview?.now;
  const visitsBefore = overview?.before;
  const landingBy = new Map(landing?.map((row) => [row.path, row]) ?? []);

  // Channels and referring websites both come from the same visit rows.
  const channels = channelRows && [...channelRows.reduce((all, row) => {
    const entry = all.get(row.channel) ?? { name: row.channel, visitors: 0, pageviews: 0, sessions: 0, bounces: 0 };
    entry.visitors += row.visitors; entry.pageviews += row.pageviews; entry.sessions += row.sessions; entry.bounces += row.bounces;
    return all.set(row.channel, entry);
  }, new Map<string, { name: string; visitors: number; pageviews: number; sessions: number; bounces: number }>()).values()]
    .map(({ bounces, ...row }) => ({ ...row, bounceRate: row.sessions ? bounces / row.sessions : 0 }))
    .sort((a, b) => b.visitors - a.visitors);
  const sources = channelRows && [...channelRows.reduce((all, row) => {
    const name = sourceName(row.referrer);
    return all.set(name, (all.get(name) ?? 0) + row.visitors);
  }, new Map<string, number>())].map(([name, visitors]) => ({ name, visitors })).sort((a, b) => b.visitors - a.visitors).slice(0, 8);

  return {
    configured: true as const,
    environment: env,
    days,
    /** True when visits had to be estimated from page views (PostHog's session data could not be read). */
    approximate,
    totals: (summary || visitsNow) && {
      visitors: visitsNow?.visitors ?? summary?.visitors ?? 0,
      pageviews: visitsNow?.pageviews ?? null,
      sessions: visitsNow?.sessions ?? null,
      /** Average visit length in seconds. */
      duration: visitsNow?.duration ?? null,
      /** Share of visits that left after one page (0 to 1). */
      bounceRate: visitsNow?.bounceRate ?? null,
      clicks: summary?.clicks ?? null,
      basketAdds: summary?.basketAdds ?? null,
    },
    /** Change against the period just before (0.1 = 10% more); null when there is nothing to compare with. */
    changes: {
      visitors: visitsNow && visitsBefore ? change(visitsNow.visitors, visitsBefore.visitors) : null,
      pageviews: visitsNow && visitsBefore ? change(visitsNow.pageviews, visitsBefore.pageviews) : null,
      sessions: visitsNow && visitsBefore ? change(visitsNow.sessions, visitsBefore.sessions) : null,
      duration: visitsNow && visitsBefore?.sessions ? change(visitsNow.duration, visitsBefore.duration) : null,
      /** Percentage points, e.g. 0.05 = 5 points higher. */
      bounceRate: visitsNow && visitsBefore?.sessions ? visitsNow.bounceRate - visitsBefore.bounceRate : null,
      clicks: summary ? change(summary.clicks, summary.clicksBefore) : null,
      basketAdds: summary ? change(summary.basketAdds, summary.basketAddsBefore) : null,
    },
    funnel: summary && [
      { step: 'Visited the website', people: summary.visitors },
      { step: 'Looked at the programs', people: summary.programViewers },
      { step: 'Added to basket', people: summary.basketAdders },
      { step: 'Started checkout', people: summary.checkoutStarters },
      { step: 'Paid', people: summary.buyers },
    ],
    daily,
    pages: pages && pages.map((page) => ({
      ...page,
      /** Average seconds the page stayed open, and how far down it was scrolled (0 to 1). */
      seconds: pageTime?.get(page.path)?.seconds ?? null,
      scrolled: pageTime?.get(page.path)?.scrolled ?? null,
      /** Bounce rate of visits that started on this page. */
      bounceRate: landingBy.get(page.path)?.bounceRate ?? null,
    })),
    landing,
    channels,
    sources,
    devices,
    clicks,
    basket,
    hours,
    frustration,
    vitals,
    errors,
    postHogUrl: `${settings.host}/project/${settings.projectId}/web`,
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
          AND event IN ('$pageview', '$autocapture', '$rageclick', 'basket_added', 'checkout_started', 'purchase_completed')
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
