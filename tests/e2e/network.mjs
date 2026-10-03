import { MockAgent, setGlobalDispatcher } from 'undici';
import https from 'node:https';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

// The AWS S3 SDK uses Node HTTPS rather than fetch. Redirect its dummy R2 host
// only in this isolated launcher; application storage configuration is unchanged.
https.request = (options, callback) => {
  const host = options?.hostname || options?.host;
  const virtualBucket = host === 'browser-private.fixture.r2.cloudflarestorage.com';
  if (host !== 'fixture.r2.cloudflarestorage.com' && !virtualBucket) {
    throw new Error('Unexpected external HTTPS request in browser tests.');
  }
  return http.request({ ...options, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1',
    port: 4312, path: `/r2${virtualBucket ? '/browser-private' : ''}${options.path}`, agent: undefined }, callback);
};
syncBuiltinESMExports();

// Loaded only by the test launcher, never by application config or production builds.
// Even accidentally introduced fetches cannot reach live providers.
const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(host => /^127\.0\.0\.1:431[012]$/.test(host));
setGlobalDispatcher(agent);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const value = input instanceof Request ? input.url : String(input);
  const url = new URL(value);
  const prefixes = { 'api.paystack.co': '/paystack', 'challenges.cloudflare.com': '/turnstile' };
  if (prefixes[url.hostname]) {
    const target = `http://127.0.0.1:4312${prefixes[url.hostname]}${url.pathname}${url.search}`;
    return originalFetch(input instanceof Request ? new Request(target, input) : target, init);
  }
  return originalFetch(input, init);
};
