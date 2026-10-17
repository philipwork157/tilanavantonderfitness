import 'server-only';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Ask Cloudflare whether a Turnstile token is genuine. Never throws; false on any failure. */
export async function verifyTurnstileToken(
  token: string,
  options: { secret: string; remoteIp?: string; fetcher?: typeof fetch },
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret: options.secret, response: token });
  if (options.remoteIp) body.set('remoteip', options.remoteIp);

  try {
    const response = await (options.fetcher ?? fetch)(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean };
    return result.success === true;
  }
  catch {
    return false;
  }
}
