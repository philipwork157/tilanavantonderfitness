import { test, expect, type Page } from '@playwright/test';

const admin = 'http://127.0.0.1:4311';
const providers = 'http://127.0.0.1:4312';
const basketKey = 'tilana-programme-basket';

/** Simulate the external challenge and hosted page, never our checkout/status APIs. */
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({ contentType: 'application/javascript', body: `
      document.querySelectorAll('.cf-turnstile').forEach(el => {
        const input = document.createElement('input'); input.type = 'hidden';
        input.name = 'cf-turnstile-response'; input.value = 'browser-fixture-token'; el.append(input);
      }); window.turnstile = { reset() {} };` });
    if (url.hostname === 'checkout.paystack.com') return route.fulfill({ contentType: 'text/html', body: '<h1>Fixture hosted checkout</h1>' });
    return route.abort();
  });
});

async function selection(page: Page, count = 2) {
  // Use real public add-to-basket buttons, including the carousel controls.
  await page.goto('/program');
  for (let index = 1; index <= count; index++) {
    const add = page.getByRole('button', { name: `Add Browser Volume ${index} to basket`, exact: true });
    // Program slides use horizontal scrolling; bring the selected live control into view.
    await add.scrollIntoViewIfNeeded();
    await add.click();
  }
  await page.locator('[data-basket-link]').click();
  await expect(page.locator('[data-basket-items] article')).toHaveCount(count);
}

async function details(page: Page, email: string) {
  await page.getByLabel('First name', { exact: true }).fill('Browser');
  await page.getByLabel('Last name', { exact: true }).fill('Buyer');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.locator('input[name=consent]').check();
}

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Pay securely for my programmes', exact: true }).click();
  await page.waitForURL('https://checkout.paystack.com/**');
  return new URL(page.url()).pathname.slice(1);
}

test('two-volume checkout retries one intent, confirms payment, emails and signs in through real HTTP cookies', async ({ page, context, request }) => {
  await selection(page);
  await details(page, 'buyer@example.test');
  // Simulate a lost browser response after the real server has reserved checkout.
  let first = true;
  await page.route('**/api/checkout/paystack/basket', async route => {
    if (!first) return route.continue();
    first = false;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Pay securely for my programmes', exact: true }).click();
  await expect(page.locator('[data-form-status]')).not.toBeEmpty();
  const reference = await submit(page);
  expect((await (await request.get(`${providers}/state`)).json()).initializeCalls).toBe(1);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'pending', amount_cents: 30000, items: 2, grants: 0 }]);

  await request.post(`${providers}/outcome`, { data: { reference, status: 'success' } });
  await page.goto(`/checkout/complete?reference=${reference}`);
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual([]);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'succeeded', amount_cents: 30000, items: 2, grants: 2 }]);
  await expect.poll(async () => (await (await request.get(`${providers}/state`)).json()).mailbox.length).toBe(1);
  const purchase = (await (await request.get(`${providers}/state`)).json()).mailbox[0];
  expect(purchase.Destination.ToAddresses).toEqual(['inbox@example.test']);
  expect(purchase.Content.Simple.Attachments).toHaveLength(2);
  expect(purchase.Content.Simple.Attachments.every((attachment: { RawContent: string }) => Buffer.from(attachment.RawContent, 'base64').subarray(0, 5).toString() === '%PDF-')).toBe(true);
  expect(purchase.Content.Simple.Body.Text.Data).toContain('http://127.0.0.1:4311/account/sign-in');
  await page.getByRole('link', { name: 'Access my programs' }).click();
  // SSR inputs are visible before Vue attaches v-model; wait for real hydration.
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as Element & { __vue_app__?: { config: { globalProperties: { $nuxt?: { isHydrating: boolean } } } } };
    return root?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating === false;
  });
  await page.getByLabel('Purchase email').fill('buyer@example.test');
  await page.getByRole('button', { name: 'Email my sign-in link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect.poll(async () => (await (await request.get(`${providers}/state`)).json()).mailbox.length).toBe(2);
  const mail = (await (await request.get(`${providers}/state`)).json()).mailbox[1];
  expect(mail.Content.Simple.Attachments).toBeUndefined();
  expect(mail.Destination.ToAddresses).toEqual(['inbox@example.test']);
  const link = mail.Content.Simple.Body.Text.Data.match(/http:\/\/127\.0\.0\.1:4311\/api\/customer\/auth\/confirm\?[^\s]+/)[0];
  await page.close();
  const signedIn = await context.newPage();
  await signedIn.goto(link);
  await expect(signedIn).toHaveURL(`${admin}/account/programs`);
  await expect(signedIn.getByText('Browser Volume 1', { exact: true })).toBeVisible();
  await expect(signedIn.getByText('Browser Volume 2', { exact: true })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name.includes('auth-token') && cookie.httpOnly)).toBe(true);
  expect((await signedIn.request.get(`${admin}/api/customer/files/3`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get(`${admin}/api/customer/files/1`, { maxRedirects: 0 })).status()).toBe(401);
  const download = await signedIn.request.get(`${admin}/api/customer/files/1`, { maxRedirects: 0 });
  expect(download.status()).toBe(302);
  expect(download.headers().location).toContain('fixture.r2.cloudflarestorage.com');
  await signedIn.goto(link);
  await expect(signedIn).toHaveURL(/error=expired-link/);
});

test('cross-tab basket changes update the rendered checkout and double submit cannot duplicate payment', async ({ page, context, request }) => {
  await selection(page, 1);
  const other = await context.newPage();
  await other.goto('/checkout?programme=browser-volume-2');
  await expect(page.locator('[data-basket-items] article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Browser Volume 1 from basket' }).click();
  await expect(other.locator('[data-basket-items] article')).toHaveCount(1);
  await details(page, 'second@example.test');
  const before = (await (await request.get(`${providers}/state`)).json()).initializeCalls;
  await page.locator('[data-checkout-form]').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForURL('https://checkout.paystack.com/**');
  const reference = new URL(page.url()).pathname.slice(1);
  expect((await (await request.get(`${providers}/state`)).json()).initializeCalls).toBe(before + 1);
  await request.post(`${providers}/outcome`, { data: { reference, status: 'failed' } });
  await page.goto(`/checkout/complete?reference=${reference}`);
  await expect(page.getByRole('heading', { name: 'Payment not completed' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual(['browser-volume-2']);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'failed', amount_cents: 20000, items: 1, grants: 0 }]);
});

test('pending provider evidence does not clear the basket or grant access', async ({ page, request }) => {
  await selection(page, 1);
  await details(page, 'pending@example.test');
  const reference = await submit(page);
  await page.goto(`/checkout/complete?reference=${reference}`);
  await expect(page.getByRole('heading', { name: 'Payment is still processing' })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual(['browser-volume-1']);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'pending', amount_cents: 10000, items: 1, grants: 0 }]);
});

test('real checkout HTTP boundary rejects a foreign origin and missing challenge', async ({ request }) => {
  const endpoint = `${admin}/api/checkout/paystack/basket`;
  expect((await request.post(endpoint, { headers: { origin: 'https://attacker.example' }, data: {} })).status()).toBe(403);
  const response = await request.post(endpoint, { headers: { origin: 'http://127.0.0.1:4310' }, data: {
    idempotencyKey: crypto.randomUUID(), items: [{ volumeSlug: 'browser-volume-1', expectedPriceCents: 10000 }],
    firstName: 'Fixture', lastName: 'Buyer', email: 'invalid@example.test', consent: true, phone: '', website: '', turnstileToken: '',
  } });
  expect(response.status()).toBe(400);
});
