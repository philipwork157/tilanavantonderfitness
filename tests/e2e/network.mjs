import { MockAgent, setGlobalDispatcher } from 'undici';

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
