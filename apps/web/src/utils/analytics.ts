import type { CaptureResult, PostHog } from 'posthog-js';

/**
 * Product analytics with PostHog, set up to match the privacy policy:
 * - Cookieless: nothing is stored in the visitor's browser. PostHog counts
 *   visitors with a daily-changing server-side hash (needs "Cookieless server
 *   hash mode" switched on in the PostHog project settings).
 * - No session recordings, surveys or person profiles, and nobody is identified.
 * - Tokens, payment references and pre-filled messages are removed from every
 *   URL before an event leaves the browser.
 * PostHog loads after the page is idle, so it never slows the first paint.
 * Without PUBLIC_POSTHOG_KEY nothing loads and track() does nothing.
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

/** Events sent before PostHog has loaded; flushed once it is ready. */
const waiting: { event: string; properties?: Properties; beacon?: boolean }[] = [];
let client: PostHog | null = null;
let starting = false;

/** Query parameters that must never reach analytics. */
const PRIVATE_PARAMS = ['token', 'reference', 'message', 'email', 'trxref'];
const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$prev_pageview_pathname'];

/** Removes private query parameters from a URL (other text is returned as it is). */
export function scrubUrl(value: string): string {
  if (!value.includes('?')) return value;
  try {
    const url = new URL(value, 'https://placeholder.invalid');
    let changed = false;
    for (const name of PRIVATE_PARAMS) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    if (!changed) return value;
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    return absolute ? url.href : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.split('?')[0] ?? value;
  }
}

/** Last check on every event before it is sent. */
export function scrubEvent(event: CaptureResult | null, environment: string): CaptureResult | null {
  if (!event) return event;
  for (const key of URL_PROPERTIES) {
    const value = event.properties[key];
    if (typeof value === 'string') event.properties[key] = scrubUrl(value);
  }
  event.properties.site_environment = environment;
  return event;
}

/**
 * Records a product event, e.g. track('basket_added', { program: 'beginner-volume-1' }).
 * Never pass names, email addresses or anything a visitor typed.
 * `beacon` is for events sent just before leaving the page (e.g. going to Paystack).
 */
export function track(event: string, properties?: Properties, options: { beacon?: boolean } = {}): void {
  if (client) {
    client.capture(event, properties, options.beacon ? { transport: 'sendBeacon', send_instantly: true } : undefined);
  } else if (waiting.length < 50) {
    waiting.push({ event, properties, beacon: options.beacon });
  }
}

/** Loads PostHog when the browser is idle. Called once from the site layout. */
export function startAnalytics(key: string, host: string, environment: string): void {
  if (starting || !key) return;
  starting = true;
  const load = async () => {
    const { default: posthog } = await import('posthog-js');
    posthog.init(key, {
      api_host: host,
      defaults: '2026-05-30',
      cookieless_mode: 'always',
      person_profiles: 'never',
      disable_session_recording: true,
      disable_surveys: true,
      // Localhost is told apart with `site_environment` instead (this option would create person profiles).
      internal_or_test_user_hostname: null,
      before_send: (event) => scrubEvent(event, environment),
    });
    client = posthog;
    for (const item of waiting.splice(0)) track(item.event, item.properties, { beacon: item.beacon });
  };
  const run = () => { load().catch(() => { starting = false; waiting.length = 0; }); };
  // Safari has no requestIdleCallback; a short delay does the same job there.
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
