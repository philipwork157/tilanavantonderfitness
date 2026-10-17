import 'server-only';
import { serverConfig } from '../config';

/**
 * Where a page lives on the public website, e.g. https://tilanavantonder.co.za/blog/my-post,
 * so the admin can offer "View on the website". Null while WEBSITE_URL is not set.
 */
export function publicUrl(path: string): string | null {
  const site = String(serverConfig().websiteUrl ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/]+$/.test(site) ? `${site}${path}` : null;
}
