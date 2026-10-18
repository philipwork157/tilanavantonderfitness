import 'server-only';
import { serverConfig } from '@/server/config';
import { WEBSITE_PERIODS, type SiteEnvironment, type WebsitePeriod } from './website-stats';

/**
 * Which visits this admin shows. Fixed per environment, not chosen on the page:
 * locally and on admin-dev your own test visits (localhost + the dev website),
 * on the live admin only the live website.
 */
export function siteFrom(): SiteEnvironment {
  return serverConfig().siteEnvironment;
}

/** ?days=7|30|90, default 30. */
export function periodFrom(url: URL): WebsitePeriod {
  const asked = Number(url.searchParams.get('days'));
  return (WEBSITE_PERIODS as readonly number[]).includes(asked) ? asked as WebsitePeriod : 30;
}
