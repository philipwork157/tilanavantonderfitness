/** Fly.io health check: the server is up and answering. No database or sign-in needed. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
