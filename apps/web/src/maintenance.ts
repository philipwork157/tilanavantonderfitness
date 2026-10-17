/**
 * Maintenance mode for the public website, switched at runtime (no rebuild).
 *
 * On:  Cloudflare dashboard → Workers → tilanavantonder-website-prod →
 *      Settings → Variables and secrets → MAINTENANCE_MODE = on → Deploy.
 * Off: set it to off (or delete it).
 *
 * While it is on, every page answers 503 with a short "back soon" page,
 * except the paths in ALWAYS_OPEN. To see the real site anyway, open any page
 * once with ?preview=<MAINTENANCE_BYPASS_TOKEN> (a Worker secret): that browser
 * gets a cookie for 12 hours. ?preview=off removes it.
 *
 * The cookie holds a SHA-256 of the token, never the token itself. Without a
 * token of at least 16 characters the bypass is off. Used by src/worker.ts.
 */

export type MaintenanceEnv = {
  MAINTENANCE_MODE?: unknown;
  MAINTENANCE_BYPASS_TOKEN?: unknown;
};

export const PREVIEW_PARAM = 'preview';
export const PREVIEW_COOKIE = 'tvt_preview';
const PREVIEW_HOURS = 12;
const MIN_TOKEN_LENGTH = 16;

/**
 * Still served during maintenance: unsubscribing is a legal must (mail apps
 * call /newsletter/one-click from their servers), robots.txt keeps search
 * engines calm, and someone mid-payment must reach their order status page.
 */
const ALWAYS_OPEN = [/^\/robots\.txt$/, /^\/newsletter(\/|$)/, /^\/checkout\/complete(\/|$)/];

export function maintenanceOn(env: MaintenanceEnv): boolean {
  return ['on', 'true', '1', 'yes'].includes(String(env.MAINTENANCE_MODE ?? '').trim().toLowerCase());
}

export function alwaysOpen(pathname: string): boolean {
  return ALWAYS_OPEN.some((pattern) => pattern.test(pathname));
}

function bypassToken(env: MaintenanceEnv): string | null {
  const token = String(env.MAINTENANCE_BYPASS_TOKEN ?? '').trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tvt-preview:${text}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function withoutPreviewParam(url: URL): string {
  const clean = new URL(url);
  clean.searchParams.delete(PREVIEW_PARAM);
  return `${clean.pathname}${clean.search}${clean.hash}`;
}

function redirect(location: string, cookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, 'set-cookie': cookie, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

/**
 * What to do with a request: null = serve the website as usual, or a Response
 * (the maintenance page, or the redirect that sets or clears the preview cookie).
 */
export async function maintenanceResponse(request: Request, env: MaintenanceEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const token = bypassToken(env);
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  // ?preview=... works whether maintenance is on or off, so the cookie can be set up ahead of time.
  const asked = url.searchParams.get(PREVIEW_PARAM);
  if (asked !== null) {
    if (asked === 'off') {
      return redirect(withoutPreviewParam(url), `${PREVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    }
    if (token && sameText(asked, token)) {
      const value = await sha256(token);
      return redirect(withoutPreviewParam(url), `${PREVIEW_COOKIE}=${value}; Path=/; Max-Age=${PREVIEW_HOURS * 3600}; HttpOnly; SameSite=Lax${secure}`);
    }
    // A wrong token falls through: the visitor simply gets whatever everyone else gets.
  }

  if (!maintenanceOn(env) || alwaysOpen(url.pathname)) return null;

  const cookie = readCookie(request, PREVIEW_COOKIE);
  if (token && cookie && sameText(cookie, await sha256(token))) return null;

  return new Response(request.method === 'HEAD' ? null : MAINTENANCE_PAGE, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '3600',
      'x-robots-tag': 'noindex',
    },
  });
}

/** Self-contained (no scripts, fonts or images), so it works even when the rest of the site does not. */
export const MAINTENANCE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Back soon | Tilana van Tonder</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { --bg: #f6e4d9; --fg: #0f0e13; --muted: #4a4048; --accent: #865a3e; --card: #e0c3ae; --line: #0f0e13; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1c1512; --fg: #f6e4d9; --muted: #d9c5b8; --accent: #e7b591; --card: #7a4744; --line: #e8cdb9; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { display: grid; place-items: center; min-height: 100vh; padding: 1.5rem; background: var(--bg); color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
  main { width: min(100%, 34rem); padding: clamp(1.75rem, 5vw, 2.75rem); border: 2px solid var(--line); border-radius: 2rem;
    background: var(--card); box-shadow: 10px 10px 0 var(--line); }
  .brand { margin: 0 0 1.75rem; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; }
  .brand span { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 400; letter-spacing: 0; text-transform: none; font-size: 1rem; color: var(--accent); }
  h1 { margin: 0 0 1rem; font-family: Georgia, "Times New Roman", serif; font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1.1; }
  h1 em { color: var(--accent); font-weight: 400; }
  p { margin: 0 0 1rem; color: var(--muted); }
  a { color: var(--accent); font-weight: 700; text-underline-offset: 4px; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <p class="brand">Tilana <span>van Tonder</span></p>
  <h1>Back <em>very soon.</em></h1>
  <p>The website is having a little maintenance and will be back shortly. Thank you for your patience.</p>
  <p>Need me in the meantime? Email <a href="mailto:tilanavantonder@gmail.com">tilanavantonder@gmail.com</a>.</p>
</main>
</body>
</html>
`;
