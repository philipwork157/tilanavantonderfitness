import type { APIRoute } from 'astro';
import { isLiveSite, robotsTxt } from '@web/utils/site-environment';

export const prerender = true;

export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(isLiveSite, new URL('/sitemap-index.xml', site).href), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
