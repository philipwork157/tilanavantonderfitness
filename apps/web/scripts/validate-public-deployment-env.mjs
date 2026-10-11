const deployment = process.env.DEPLOYMENT_ENVIRONMENT;

const environments = {
  development: {
    adminHostname: 'admin-dev.tilanavantonder.co.za',
  },
  production: {
    adminHostname: 'admin.tilanavantonder.co.za',
  },
};

const expectedPaths = { PUBLIC_API_BASE_URL: '' };

const errors = [];
const expectedEnvironment = environments[deployment];

if (!expectedEnvironment) {
  errors.push('DEPLOYMENT_ENVIRONMENT must be "development" or "production".');
}

for (const [name, expectedPath] of Object.entries(expectedPaths)) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) {
    errors.push(`${name} is missing.`);
    continue;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') errors.push(`${name} must use HTTPS.`);
    if (expectedEnvironment && url.hostname !== expectedEnvironment.adminHostname) {
      errors.push(`${name} must use ${expectedEnvironment.adminHostname} for ${deployment}.`);
    }
    if (url.pathname.replace(/\/$/, '') !== expectedPath) {
      errors.push(`${name} must use the ${expectedPath} path.`);
    }
    if (url.username || url.password || url.port || url.search || url.hash) errors.push(`${name} must not include a query string or fragment.`);
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

const turnstileSiteKey = String(process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
if (!turnstileSiteKey || turnstileSiteKey.includes('REPLACE_WITH')) {
  errors.push('PUBLIC_TURNSTILE_SITE_KEY is missing.');
}

const siteEnvironment = String(process.env.PUBLIC_SITE_ENVIRONMENT ?? '').trim();
if (siteEnvironment !== deployment) {
  errors.push(`PUBLIC_SITE_ENVIRONMENT must be "${deployment}" (it labels the visits in the admin's Website page).`);
}

// Analytics are optional: without a key the website simply loads no PostHog.
if (!String(process.env.PUBLIC_POSTHOG_KEY ?? '').trim()) {
  console.warn('::warning::PUBLIC_POSTHOG_KEY is empty, so this website will not record any visits.');
}

if (errors.length) {
  console.error(`Invalid ${deployment || 'public'} deployment configuration:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${deployment} public deployment configuration.`);
