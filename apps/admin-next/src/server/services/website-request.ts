import 'server-only';
import { isDevelopment } from '@/server/config';
import { WEBSITE_PERIODS, type SiteEnvironment, type WebsitePeriod } from './website-stats';

/** ?site=live|testing. Locally the default is your own test visits; on the live admin, the website. */
export function siteFrom(url: URL): SiteEnvironment {
  const site = url.searchParams.get('site');
  if (site === 'live') return 'production';
  if (site === 'testing') return 'development';
  return isDevelopment ? 'development' : 'production';
}

/** ?days=7|30|90, default 30. */
export function periodFrom(url: URL): WebsitePeriod {
  const asked = Number(url.searchParams.get('days'));
  return (WEBSITE_PERIODS as readonly number[]).includes(asked) ? asked as WebsitePeriod : 30;
}
