import { test, expect, type Page } from '@playwright/test';
import { programPdfFixture } from './program-pdf';

const admin = 'http://127.0.0.1:4311';
const providers = 'http://127.0.0.1:4312';
const basketKey = 'tilana-programme-basket';

/** Simulate the external challenge and hosted page, never our checkout/status APIs. */
test.beforeEach(async ({ context }, testInfo) => {
  // Separate synthetic visitors must not exhaust each other's real shared IP allowance.
  await context.setExtraHTTPHeaders({ 'x-browser-fixture-ip': `127.0.0.${1 + testInfo.line % 200}` });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({ contentType: 'application/javascript', body: `
      document.querySelectorAll('.cf-turnstile').forEach(el => {
        const input = document.createElement('input'); input.type = 'hidden';
        input.name = 'cf-turnstile-response'; input.value = 'browser-fixture-token'; el.append(input);
      }); window.turnstile = { reset() {} };` });
    if (url.hostname === 'checkout.paystack.com') return route.fulfill({ contentType: 'text/html', body: '<h1>Fixture hosted checkout</h1>' });
    if (['fixture.r2.cloudflarestorage.com', 'browser-private.fixture.r2.cloudflarestorage.com'].includes(url.hostname)) {
      const path = url.hostname.startsWith('browser-private.') ? `/browser-private${url.pathname}` : url.pathname;
      return route.fulfill({ response: await route.fetch({ url: `${providers}/r2${path}${url.search}` }) });
    }
    return route.abort();
  });
});

/** Wait for v-model/event handlers, not just the server-rendered Nuxt form. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as Element & { __vue_app__?: { config: { globalProperties: { $nuxt?: { isHydrating: boolean } } } } };
    return root?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating === false;
  });
}

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
  await hydrated(page);
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
  const emailsBeforeFailure = (await (await request.get(`${providers}/state`)).json()).mailbox.length;
  await request.post(`${providers}/outcome`, { data: { reference, status: 'failed' } });
  await page.goto(`/checkout/complete?reference=${reference}`);
  await expect(page.getByRole('heading', { name: 'Sorry, something went wrong' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to checkout' })).toHaveAttribute('href', '/checkout');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual(['browser-volume-2']);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'failed', amount_cents: 20000, items: 1, grants: 0 }]);
  expect((await (await request.get(`${providers}/state`)).json()).mailbox.length).toBe(emailsBeforeFailure);
});

test('pending provider evidence does not clear the basket or grant access', async ({ page, request }) => {
  await selection(page, 1);
  await details(page, 'pending@example.test');
  const reference = await submit(page);
  await page.goto(`/checkout/complete?reference=${reference}`);
  await expect(page.getByRole('heading', { name: 'Payment is still processing' })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual(['browser-volume-1']);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'pending', amount_cents: 10000, items: 1, grants: 0 }]);
  await request.post(`${providers}/outcome`, { data: { reference, status: 'success' } });
  await page.getByRole('button', { name: 'Check payment again' }).click();
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), basketKey)).toEqual([]);
  expect(await (await request.get(`${providers}/purchase?reference=${reference}`)).json()).toEqual([{ status: 'succeeded', amount_cents: 10000, items: 1, grants: 1 }]);
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

test('wife signs in, views Paystack sales and replaces Nourish PDF before the next attached-file purchase', async ({ page, request, context }) => {
  test.setTimeout(120000);
  const state = async () => (await (await request.get(`${providers}/state`)).json());
  const fileHistory = async () => (await (await request.get(`${providers}/program-files?volume=browser-volume-3`)).json()) as Array<{ id: number; version: number; is_active: boolean; upload_status: string }>;
  const firstMailboxCount = (await state()).mailbox.length;
  // First buy the current edition through the same public form and payment verification.
  await page.goto('/program');
  const addNourish = page.getByRole('button', { name: 'Add Nourish Volume 1 to basket', exact: true });
  await addNourish.scrollIntoViewIfNeeded(); await addNourish.click();
  await page.locator('[data-basket-link]').click();
  await details(page, 'wife-flow@example.test');
  const firstReference = await submit(page);
  await request.post(`${providers}/outcome`, { data: { reference: firstReference, status: 'success' } });
  await page.goto(`/checkout/complete?reference=${firstReference}`);
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect.poll(async () => (await state()).mailbox.length).toBe(firstMailboxCount + 1);
  const firstEmail = (await state()).mailbox[firstMailboxCount];
  expect(Buffer.from(firstEmail.Content.Simple.Attachments[0].RawContent, 'base64')).toEqual(programPdfFixture());

  // Authentication and authorization remain real app routes with a seeded integer admin role.
  await page.goto(`${admin}/login`); await hydrated(page);
  await page.getByLabel('Email address', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-only-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${admin}/dashboard`);
  expect((await context.cookies()).some(cookie => cookie.name.includes('auth-token') && cookie.httpOnly)).toBe(true);
  await page.getByRole('link', { name: 'Clients', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Paystack purchases', exact: true })).toBeVisible();
  await page.getByPlaceholder('Search clients or programmes').fill('wife-flow@example.test');
  await expect(page.getByText('wife-flow@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('Email accepted by SES', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Programs', exact: true }).first().click();
  const nourishCard = page.locator('.program-card').filter({ has: page.getByRole('heading', { name: 'Nourish', exact: true }) });
  await nourishCard.getByRole('link', { name: 'Manage program' }).click();
  const volume = page.locator('.volume-card').filter({ has: page.getByRole('heading', { name: 'Nourish Volume 1', exact: true }) });
  const oldFile = (await fileHistory()).find(file => file.is_active && file.upload_status === 'ready')!;
  // Appending a harmless PDF comment keeps a valid document while proving new bytes were used.
  const nextEdition = Buffer.concat([programPdfFixture(), Buffer.from('\n% New Nourish edition fixture\n')]);
  const uploadCompleted = page.waitForResponse(response => /\/api\/admin\/program-files\/\d+\/finalize$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
  const chooser = page.waitForEvent('filechooser');
  await volume.getByRole('button', { name: 'Upload latest PDF edition', exact: true }).click();
  await (await chooser).setFiles({ name: 'Nourish Volume 1 latest.pdf', mimeType: 'application/pdf', buffer: nextEdition });
  expect((await uploadCompleted).status()).toBe(200);
  await expect(page.getByText('The latest PDF edition is ready. Previous editions are retained in history.', { exact: true })).toBeVisible();
  const files = await fileHistory();
  expect(files.find(file => file.id === oldFile.id)).toMatchObject({ is_active: false, upload_status: 'ready' });
  const latest = files.find(file => file.is_active && file.upload_status === 'ready')!;
  expect(latest.id).not.toBe(oldFile.id); expect(latest.version).toBe(oldFile.version + 1);
  const catalogue = await (await request.get(`${admin}/api/public/programs`)).json();
  expect(catalogue.programs.find((program: { name: string }) => program.name === 'Nourish').volumes[0].isAvailable).toBe(true);

  // A fresh purchaser receives the new edition; the original paid PDF record remains retained.
  const beforeNewEmail = (await state()).mailbox.length;
  await page.goto('/checkout?programme=browser-volume-3');
  await details(page, 'latest-edition@example.test');
  const nextReference = await submit(page);
  await request.post(`${providers}/outcome`, { data: { reference: nextReference, status: 'success' } });
  await page.goto(`/checkout/complete?reference=${nextReference}`);
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect.poll(async () => (await state()).mailbox.length).toBe(beforeNewEmail + 1);
  const newEmail = (await state()).mailbox[beforeNewEmail];
  expect(newEmail.Content.Simple.Attachments).toHaveLength(1);
  expect(Buffer.from(newEmail.Content.Simple.Attachments[0].RawContent, 'base64')).toEqual(nextEdition);
  expect(await (await request.get(`${providers}/purchase?reference=${firstReference}`)).json()).toEqual([{ status: 'succeeded', amount_cents: 30000, items: 1, grants: 1 }]);
});
