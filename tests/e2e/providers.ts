import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@tilana/db/server';
import { programPdfFixture } from './program-pdf';

/** Local-only simulations of external boundaries; no application route is replaced. */
export function createProviders(database: Database, administrator: { id: string; email: string; password: string }) {
  const charges = new Map<string, { reference: string; amount: number; status: string; id: number }>();
  const tokens = new Map<string, { id: string; email: string }>();
  const sessions = new Map<string, { id: string; email: string }>();
  const mailbox: unknown[] = [];
  const pdf = programPdfFixture();
  const objects = new Map<string, { content: Buffer; contentType: string; etag: string }>();
  for (let index = 1; index <= 3; index++) objects.set(`/r2/browser-private/guide-${index}.pdf`, { content: pdf, contentType: 'application/pdf', etag: 'browser-pdf' });
  let ready = false;
  let initializeCalls = 0;
  /** Both fixture password and OTP paths return the same server-validated session shape. */
  function createSession(user: { id: string; email: string }) {
    const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url');
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${claims}.fixture`;
    sessions.set(token, user);
    return { access_token: token, refresh_token: randomUUID(), token_type: 'bearer', expires_in: 3600,
      user: { ...user, aud: 'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} } };
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1:4312');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const raw = bytes.toString();
    const send = (data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname.startsWith('/r2/browser-private/')) {
        // The browser PUT and the app's SDK HEAD/GET use the same local binary bytes.
        res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4311');
        res.setHeader('Access-Control-Allow-Methods', 'PUT, HEAD, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, x-browser-fixture-ip');
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        if (req.method === 'PUT') {
          objects.set(decodeURIComponent(url.pathname), { content: bytes,
            contentType: String(req.headers['content-type'] || 'application/pdf'), etag: createHash('sha256').update(bytes).digest('hex') });
          res.writeHead(200); return res.end();
        }
        const object = objects.get(decodeURIComponent(url.pathname));
        if (!object) return send({}, 404);
        if (req.headers['if-match'] && req.headers['if-match'] !== `"${object.etag}"`) return send({}, 412);
        res.writeHead(200, { 'Content-Type': object.contentType, 'Content-Length': object.content.byteLength, ETag: `"${object.etag}"` });
        return res.end(req.method === 'HEAD' ? undefined : object.content);
      }
      const body = raw && !url.pathname.startsWith('/turnstile') ? JSON.parse(raw) : {};
      if (url.pathname === '/ready') return send({ ready }, ready ? 200 : 503);
      if (url.pathname === '/state') return send({ charges: [...charges.values()], initializeCalls, mailbox });
      if (url.pathname === '/purchase') {
        const rows = await database.$client`select p.status, p.amount_cents,
          (select count(*)::int from order_items i where i.order_id = p.order_id) as items,
          (select count(*)::int from program_access a join order_items i on i.id = a.order_item_id where i.order_id = p.order_id and a.status = 'active') as grants
          from payments p where p.provider_reference = ${url.searchParams.get('reference')}`;
        return send(rows);
      }
      if (url.pathname === '/program-files') {
        return send(await database.$client`select f.id, f.version, f.is_active, f.upload_status, f.r2_object_key
          from program_files f join program_volumes v on v.id = f.program_volume_id
          where v.slug = ${url.searchParams.get('volume')} order by f.version`);
      }
      if (url.pathname === '/outcome') {
        const charge = charges.get(body.reference);
        if (!charge) return send({}, 404);
        charge.status = body.status;
        return send({ ok: true });
      }
      if (url.pathname === '/turnstile/turnstile/v0/siteverify') {
        const input = new URLSearchParams(raw);
        return send({ success: input.get('response') === 'browser-fixture-token', action: 'checkout' });
      }
      if (url.pathname === '/paystack/transaction/initialize') {
        initializeCalls++;
        charges.set(body.reference, { reference: body.reference, amount: Number(body.amount), status: 'pending', id: initializeCalls });
        return send({ status: true, message: 'Fixture', data: { reference: body.reference,
          authorization_url: `https://checkout.paystack.com/${body.reference}`, access_code: `fixture-${initializeCalls}` } });
      }
      if (url.pathname.startsWith('/paystack/transaction/verify/')) {
        const charge = charges.get(url.pathname.split('/').at(-1)!);
        return send({ status: true, message: 'Fixture', data: { ...charge, domain: 'test', currency: 'ZAR', paid_at: new Date().toISOString() } });
      }
      if (url.pathname === '/auth/v1/admin/generate_link') {
        const id = randomUUID();
        await database.$client`insert into auth.users (id) values (${id})`;
        const hash = randomUUID();
        tokens.set(hash, { id, email: body.email });
        return send({ id, email: body.email, hashed_token: hash, action_link: 'http://127.0.0.1:4312/unused', verification_type: 'magiclink', email_otp: '123456' });
      }
      if (url.pathname === '/auth/v1/verify') {
        const user = tokens.get(body.token_hash);
        if (!user) return send({ msg: 'Expired or invalid fixture token' }, 403);
        tokens.delete(body.token_hash);
        return send(createSession(user));
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        if (body.email !== administrator.email || body.password !== administrator.password) return send({ msg: 'Invalid fixture credentials' }, 400);
        return send(createSession({ id: administrator.id, email: administrator.email }));
      }
      if (url.pathname === '/auth/v1/user') {
        const user = sessions.get(String(req.headers.authorization).replace(/^Bearer /, ''));
        return user ? send({ ...user, aud: 'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }) : send({ msg: 'Invalid session' }, 401);
      }
      if (url.pathname === '/auth/v1/logout') return send({});
      if (url.pathname === '/v2/email/outbound-emails') {
        mailbox.push(body);
        return send({ MessageId: randomUUID() });
      }
      return send({ error: `Unconfigured fixture: ${url.pathname}` }, 404);
    } catch (error) {
      console.error('Fixture request failed', error);
      send({ error: 'Fixture failed' }, 500);
    }
  });
  return { server, markReady: () => { ready = true; } };
}
