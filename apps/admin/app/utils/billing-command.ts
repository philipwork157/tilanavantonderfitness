/** Store only a request digest/key, never billing details; lost responses reuse the same command. */
export async function submitBillingCommand(url: string, body: Record<string, unknown>,
  fetchCommand: (url: string, options: { method: 'POST'; body: Record<string, unknown> }) => Promise<unknown>) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ url, body })));
  const storageKey = `tilana:billing:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  // Fail closed if storage cannot preserve the retry key across reloads.
  const idempotencyKey = sessionStorage.getItem(storageKey) || crypto.randomUUID();
  sessionStorage.setItem(storageKey, idempotencyKey);
  const result = await fetchCommand(url, { method: 'POST', body: { ...body, idempotencyKey } });
  sessionStorage.removeItem(storageKey);
  return result;
}
