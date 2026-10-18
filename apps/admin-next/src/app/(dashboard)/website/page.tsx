import type { Metadata } from 'next';
import { serverConfig } from '@/server/config';
import { WebsiteView } from './website-view';

export const metadata: Metadata = { title: 'Website' };

export default function WebsitePage() {
  // Each admin shows its own site's visits: local + admin-dev = testing, live admin = the live website.
  return <WebsiteView site={serverConfig().siteEnvironment === 'production' ? 'live' : 'testing'} />;
}
