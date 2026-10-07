/** Fetch JSON from this app's API. Errors carry the server's friendly message. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // JSON bodies are strings; FormData (file uploads) sets its own multipart header.
  const isJson = typeof init?.body === 'string';
  const response = await fetch(path, {
    ...init,
    headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null) as ({ statusMessage?: string } & T) | null;
  if (!response.ok) {
    throw new ApiError(response.status, body?.statusMessage ?? 'Something went wrong. Please try again.');
  }
  return body as T;
}
