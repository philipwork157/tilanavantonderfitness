import type { APIRoute } from 'astro';
import { publicApiUrl } from '@web/utils/public-api';

/*
 * One-click unsubscribe (RFC 8058). Mail apps such as Gmail show an
 * "Unsubscribe" button that POSTs "List-Unsubscribe=One-Click" here, using the
 * List-Unsubscribe header of each newsletter. The token is passed to the admin,
 * which unsubscribes the reader. Someone who opens the link in a browser is
 * sent to the normal unsubscribe page instead.
 */
export const prerender = false;

const page = (token: string | null) => `/newsletter/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ''}`;

export const GET: APIRoute = ({ url, redirect }) => redirect(page(url.searchParams.get('token')), 303);

export const POST: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) return new Response('This unsubscribe link is not valid.', { status: 400 });
  try {
    const response = await fetch(publicApiUrl('/api/newsletter/one-click'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return new Response('You have been unsubscribed.', { status: 200 });
    return new Response('This unsubscribe link is not valid.', { status: response.status === 429 ? 429 : 400 });
  } catch {
    return new Response('Please try again in a moment.', { status: 503 });
  }
};
