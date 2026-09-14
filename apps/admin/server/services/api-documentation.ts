type ApiMethod = 'get' | 'post' | 'patch' | 'put';
type ApiSecurity = 'admin' | 'customer' | 'paystack' | 'public';

interface ApiQueryParameter {
  name: string;
  description: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

interface ApiEndpointDefinition {
  method: ApiMethod;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  security: ApiSecurity;
  requestSchema?: string;
  query?: ApiQueryParameter[];
  successStatus?: string;
  successDescription?: string;
}

const endpoints: ApiEndpointDefinition[] = [
  { method: 'post', path: '/api/auth/login', tag: 'Authentication', summary: 'Sign in an administrator', security: 'public', requestSchema: 'AdminLoginRequest' },
  { method: 'post', path: '/api/auth/logout', tag: 'Authentication', summary: 'Sign out the current administrator', security: 'admin' },
  { method: 'get', path: '/api/auth/session', tag: 'Authentication', summary: 'Read the current administrator session', security: 'admin' },

  { method: 'get', path: '/api/public/programs', tag: 'Public catalogue', summary: 'List purchasable programs', security: 'public' },
  { method: 'get', path: '/api/public/programs/{slug}', tag: 'Public catalogue', summary: 'Get a purchasable program by slug', security: 'public' },
  { method: 'get', path: '/api/public/program-volumes/{slug}', tag: 'Public catalogue', summary: 'Get a purchasable volume by checkout slug', security: 'public' },

  { method: 'post', path: '/api/checkout/paystack', tag: 'Checkout', summary: 'Start a Paystack checkout', description: 'Creates the pending order from the authoritative database price and returns the hosted Paystack authorization URL.', security: 'public', requestSchema: 'CheckoutRequest' },
  { method: 'get', path: '/api/checkout/status', tag: 'Checkout', summary: 'Read checkout verification status', security: 'public', query: [{ name: 'reference', description: 'Paystack checkout reference.', required: true }] },
  { method: 'post', path: '/api/webhooks/paystack', tag: 'Checkout', summary: 'Receive signed Paystack events', description: 'Paystack signature verification and idempotent reconciliation make this endpoint the payment source of truth.', security: 'paystack', successDescription: 'Event accepted or safely ignored as a duplicate.' },

  { method: 'post', path: '/api/contact', tag: 'Contact', summary: 'Submit a public contact enquiry', security: 'public', requestSchema: 'ContactRequest', successStatus: '201' },
  { method: 'post', path: '/api/newsletter/subscribe', tag: 'Newsletter', summary: 'Begin a double opt-in subscription', security: 'public', requestSchema: 'NewsletterSubscriptionRequest', successStatus: '201' },
  { method: 'get', path: '/api/newsletter/confirm', tag: 'Newsletter', summary: 'Confirm a newsletter subscription', security: 'public', query: [{ name: 'token', description: 'Email confirmation token.', required: true }] },
  { method: 'post', path: '/api/newsletter/unsubscribe', tag: 'Newsletter', summary: 'Unsubscribe an email address', security: 'public', requestSchema: 'NewsletterUnsubscribeRequest' },

  { method: 'post', path: '/api/customer/auth/magic-link', tag: 'Customer access', summary: 'Request a customer sign-in link', description: 'Always returns the same response so customer email addresses cannot be enumerated.', security: 'public', requestSchema: 'CustomerMagicLinkRequest' },
  { method: 'get', path: '/api/customer/auth/confirm', tag: 'Customer access', summary: 'Confirm a customer magic link', security: 'public', query: [{ name: 'token_hash', description: 'Supabase email token hash.', required: true }, { name: 'type', description: 'Supabase verification type.', required: true }, { name: 'next', description: 'Safe application-relative destination.' }] },
  { method: 'get', path: '/api/customer/programs', tag: 'Customer access', summary: 'List programs available to the signed-in customer', security: 'customer' },
  { method: 'get', path: '/api/customer/files/{id}', tag: 'Customer access', summary: 'Create a temporary private PDF download', description: 'Checks active entitlement before returning a short-lived R2 download URL.', security: 'customer' },

  { method: 'get', path: '/api/admin/dashboard', tag: 'Admin overview', summary: 'Read dashboard metrics', security: 'admin', query: [{ name: 'periodDays', description: 'Reporting window in days.', schema: { type: 'integer', enum: [7, 30, 90, 365], default: 30 } }] },
  { method: 'get', path: '/api/admin/contacts', tag: 'Admin overview', summary: 'List contact enquiries', security: 'admin' },
  { method: 'get', path: '/api/admin/newsletter', tag: 'Admin newsletter', summary: 'Read newsletter subscriber statistics', security: 'admin' },
  { method: 'get', path: '/api/admin/newsletter/campaigns', tag: 'Admin newsletter', summary: 'List newsletter campaigns', security: 'admin' },
  { method: 'post', path: '/api/admin/newsletter/campaigns', tag: 'Admin newsletter', summary: 'Create a newsletter campaign', security: 'admin', requestSchema: 'NewsletterCampaignRequest', successStatus: '201' },
  { method: 'patch', path: '/api/admin/newsletter/campaigns/{id}', tag: 'Admin newsletter', summary: 'Update a newsletter campaign', security: 'admin', requestSchema: 'NewsletterCampaignRequest' },
  { method: 'post', path: '/api/admin/newsletter/campaigns/{id}/test', tag: 'Admin newsletter', summary: 'Send a campaign test email', security: 'admin' },
  { method: 'post', path: '/api/admin/newsletter/campaigns/{id}/send', tag: 'Admin newsletter', summary: 'Send a campaign to confirmed subscribers', security: 'admin' },

  { method: 'get', path: '/api/admin/clients', tag: 'Admin clients', summary: 'List clients and their purchases', security: 'admin' },
  { method: 'post', path: '/api/admin/clients', tag: 'Admin clients', summary: 'Create a client and assign programs', security: 'admin', requestSchema: 'ClientRequest', successStatus: '201' },
  { method: 'patch', path: '/api/admin/clients/{id}', tag: 'Admin clients', summary: 'Update a client and assigned programs', security: 'admin', requestSchema: 'ClientRequest' },
  { method: 'get', path: '/api/admin/clients/{id}/overview', tag: 'Admin clients', summary: 'Read a client coaching overview', security: 'admin' },
  { method: 'put', path: '/api/admin/clients/{id}/health-profile', tag: 'Admin clients', summary: 'Save a client health profile', security: 'admin', requestSchema: 'GenericRequest' },
  { method: 'post', path: '/api/admin/clients/{id}/checkins', tag: 'Admin clients', summary: 'Create a client check-in', security: 'admin', requestSchema: 'GenericRequest', successStatus: '201' },
  { method: 'post', path: '/api/admin/clients/{id}/photos', tag: 'Admin clients', summary: 'Reserve a client progress-photo upload', security: 'admin', requestSchema: 'GenericRequest', successStatus: '201' },
  { method: 'post', path: '/api/admin/clients/{id}/recalculate', tag: 'Admin clients', summary: 'Recalculate client coaching targets', security: 'admin', requestSchema: 'GenericRequest' },
  { method: 'post', path: '/api/admin/orders/{id}/refund', tag: 'Admin payments', summary: 'Request a full or partial Paystack refund', description: 'Protects against refund overages and keeps ambiguous provider outcomes reserved for review.', security: 'admin', requestSchema: 'RefundRequest' },

  { method: 'get', path: '/api/admin/programs', tag: 'Admin catalogue', summary: 'List all managed programs', security: 'admin' },
  { method: 'post', path: '/api/admin/programs', tag: 'Admin catalogue', summary: 'Create a draft program', security: 'admin', requestSchema: 'ProgramRequest', successStatus: '201' },
  { method: 'get', path: '/api/admin/programs/{id}', tag: 'Admin catalogue', summary: 'Read a program with volumes, files, media, and sales', security: 'admin' },
  { method: 'patch', path: '/api/admin/programs/{id}', tag: 'Admin catalogue', summary: 'Update program marketing details', security: 'admin', requestSchema: 'ProgramRequest' },
  { method: 'get', path: '/api/admin/programs/{id}/publication', tag: 'Admin catalogue', summary: 'Read the publication checklist', security: 'admin' },
  { method: 'patch', path: '/api/admin/programs/{id}/status', tag: 'Admin catalogue', summary: 'Publish, unpublish, or archive a program', security: 'admin', requestSchema: 'ProgramStatusRequest' },
  { method: 'post', path: '/api/admin/programs/{id}/volumes', tag: 'Admin catalogue', summary: 'Create a draft program volume', security: 'admin', requestSchema: 'VolumeRequest', successStatus: '201' },
  { method: 'post', path: '/api/admin/programs/{id}/media/uploads', tag: 'Admin catalogue', summary: 'Reserve a public cover-image upload', security: 'admin', requestSchema: 'MediaUploadRequest', successStatus: '201' },
  { method: 'patch', path: '/api/admin/program-volumes/{id}', tag: 'Admin catalogue', summary: 'Update a program volume', security: 'admin', requestSchema: 'VolumeRequest' },
  { method: 'post', path: '/api/admin/program-volumes/{id}/files/uploads', tag: 'Admin catalogue', summary: 'Reserve a private PDF upload', security: 'admin', requestSchema: 'FileUploadRequest', successStatus: '201' },
  { method: 'patch', path: '/api/admin/program-media/{id}', tag: 'Admin catalogue', summary: 'Update cover-image metadata', security: 'admin', requestSchema: 'MediaMetadataRequest' },
  { method: 'post', path: '/api/admin/program-media/{id}/finalize', tag: 'Admin catalogue', summary: 'Verify and finalize an uploaded cover image', security: 'admin' },
  { method: 'post', path: '/api/admin/program-media/{id}/deactivate', tag: 'Admin catalogue', summary: 'Deactivate a cover image', security: 'admin', requestSchema: 'DeactivateRequest' },
  { method: 'patch', path: '/api/admin/program-files/{id}', tag: 'Admin catalogue', summary: 'Update private PDF metadata', security: 'admin', requestSchema: 'FileMetadataRequest' },
  { method: 'post', path: '/api/admin/program-files/{id}/finalize', tag: 'Admin catalogue', summary: 'Verify and finalize an uploaded PDF', security: 'admin', requestSchema: 'FileFinalizeRequest' },
  { method: 'post', path: '/api/admin/program-files/{id}/deactivate', tag: 'Admin catalogue', summary: 'Deactivate a private PDF', security: 'admin', requestSchema: 'DeactivateRequest' },

  { method: 'get', path: '/api/admin/openapi', tag: 'Developer documentation', summary: 'Read this OpenAPI document', security: 'admin' },
];

function operationId(method: ApiMethod, path: string): string {
  const segments = path
    .replace(/^\/api\//, '')
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase()));
  return `${method}${segments.map(segment => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`).join('')}`;
}

function securityFor(kind: ApiSecurity) {
  if (kind === 'admin') return [{ adminSession: [] }];
  if (kind === 'customer') return [{ customerSession: [] }];
  if (kind === 'paystack') return [{ paystackSignature: [] }];
  return [];
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    description: name === 'id' ? 'Positive integer database identifier.' : 'URL-safe catalogue slug.',
    schema: name === 'id'
      ? { type: 'integer', minimum: 1 }
      : { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  }));
}

function buildOperation(endpoint: ApiEndpointDefinition) {
  const successStatus = endpoint.successStatus ?? '200';
  const parameters = [
    ...pathParameters(endpoint.path),
    ...(endpoint.query ?? []).map(parameter => ({
      name: parameter.name,
      in: 'query',
      required: parameter.required ?? false,
      description: parameter.description,
      schema: parameter.schema ?? { type: 'string' },
    })),
  ];

  return {
    tags: [endpoint.tag],
    summary: endpoint.summary,
    ...(endpoint.description ? { description: endpoint.description } : {}),
    operationId: operationId(endpoint.method, endpoint.path),
    security: securityFor(endpoint.security),
    ...(parameters.length ? { parameters } : {}),
    ...(endpoint.requestSchema
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${endpoint.requestSchema}` },
              },
            },
          },
        }
      : {}),
    responses: {
      [successStatus]: {
        description: endpoint.successDescription ?? 'Successful response.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericResponse' } } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
      '500': { $ref: '#/components/responses/ServerError' },
    },
  };
}

export function getAdminOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    paths[endpoint.path] ??= {};
    paths[endpoint.path]![endpoint.method] = buildOperation(endpoint);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Tilana Platform API',
      version: '1.0.0',
      description: 'Authenticated internal reference for the Tilana public website, administration portal, customer access, catalogue, newsletter, and payment APIs. Interactive requests use the selected environment and the signed-in browser session.',
    },
    servers: [{ url: '/', description: 'Current environment' }],
    tags: [
      { name: 'Authentication', description: 'Administrator session lifecycle.' },
      { name: 'Public catalogue', description: 'Read-only endpoints consumed by the public Astro website.' },
      { name: 'Checkout', description: 'Paystack checkout, verification, and signed webhook handling.' },
      { name: 'Contact', description: 'Public enquiry capture.' },
      { name: 'Newsletter', description: 'Public subscription lifecycle.' },
      { name: 'Customer access', description: 'Passwordless customer sign-in and protected program files.' },
      { name: 'Admin overview', description: 'Private dashboard and enquiry reporting.' },
      { name: 'Admin newsletter', description: 'Private newsletter campaign management.' },
      { name: 'Admin clients', description: 'Private client, coaching, and assignment management.' },
      { name: 'Admin payments', description: 'Protected payment administration.' },
      { name: 'Admin catalogue', description: 'Protected programs, volumes, covers, and private PDFs.' },
      { name: 'Developer documentation', description: 'Private API reference metadata.' },
    ],
    paths,
    components: {
      securitySchemes: {
        adminSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-auth-token',
          description: 'Represents the project-scoped Supabase auth cookie linked to an integer application user with the admin role. The exact generated cookie name varies by environment.',
        },
        customerSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-auth-token',
          description: 'Represents the project-scoped Supabase auth cookie linked to a customer with active program access. The exact generated cookie name varies by environment.',
        },
        paystackSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'x-paystack-signature',
          description: 'HMAC signature created with the matching Paystack environment secret.',
        },
      },
      responses: {
        BadRequest: { description: 'The request contract or identifier is invalid.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Unauthorized: { description: 'A valid signed-in session is required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Forbidden: { description: 'The current user or origin is not authorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Conflict: { description: 'The request conflicts with current business state.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ServerError: { description: 'The operation could not be completed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { statusCode: { type: 'integer' }, statusMessage: { type: 'string' } },
          required: ['statusCode', 'statusMessage'],
        },
        GenericResponse: { type: 'object', additionalProperties: true },
        GenericRequest: { type: 'object', additionalProperties: true },
        AdminLoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string', format: 'email', maxLength: 254 }, password: { type: 'string', format: 'password', maxLength: 200 } },
        },
        CheckoutRequest: {
          type: 'object',
          required: ['volumeSlug', 'expectedPriceCents', 'firstName', 'lastName', 'email', 'consent'],
          properties: {
            volumeSlug: { type: 'string', example: 'beginner-volume-1' }, expectedPriceCents: { type: 'integer', minimum: 1, example: 39900 },
            firstName: { type: 'string', maxLength: 100 }, lastName: { type: 'string', maxLength: 100 }, email: { type: 'string', format: 'email' },
            phone: { type: 'string', maxLength: 30 }, consent: { type: 'boolean', const: true }, website: { type: 'string', description: 'Honeypot field. Leave empty.' },
            turnstileToken: { type: 'string', description: 'Cloudflare Turnstile token when required.' },
          },
        },
        ContactRequest: {
          type: 'object',
          required: ['name', 'email', 'interest', 'message', 'consent'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 }, email: { type: 'string', format: 'email' },
            interest: { type: 'string', enum: ['move', 'strong', 'nourish', 'reconnect', 'one-on-one', 'general'] }, message: { type: 'string', minLength: 10, maxLength: 3000 },
            consent: { type: 'boolean', const: true }, website: { type: 'string', description: 'Honeypot field. Leave empty.' }, turnstileToken: { type: 'string' },
          },
        },
        NewsletterSubscriptionRequest: {
          type: 'object', required: ['email', 'consent'],
          properties: { email: { type: 'string', format: 'email' }, consent: { type: 'boolean', const: true }, source: { type: 'string', default: 'website-footer' }, website: { type: 'string', description: 'Honeypot field. Leave empty.' }, turnstileToken: { type: 'string' } },
        },
        NewsletterUnsubscribeRequest: { type: 'object', additionalProperties: true, description: 'Unsubscribe token or email contract used by the public unsubscribe form.' },
        NewsletterCampaignRequest: {
          type: 'object', required: ['subject', 'blogTitle', 'introduction', 'blogUrl'],
          properties: { subject: { type: 'string', minLength: 3, maxLength: 150 }, previewText: { type: 'string', maxLength: 200 }, blogTitle: { type: 'string', maxLength: 160 }, introduction: { type: 'string', minLength: 10, maxLength: 1200 }, blogUrl: { type: 'string', format: 'uri', maxLength: 500 } },
        },
        CustomerMagicLinkRequest: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email', maxLength: 254 } } },
        ClientRequest: {
          type: 'object', required: ['firstName', 'lastName', 'email', 'programmes'],
          properties: { firstName: { type: 'string', maxLength: 100 }, lastName: { type: 'string', maxLength: 100 }, email: { type: 'string', format: 'email' }, phone: { type: 'string', maxLength: 40 }, gender: { type: ['string', 'null'], enum: ['female', 'male', 'non-binary', 'other', 'prefer-not-to-say', null] }, notes: { type: 'string', maxLength: 2000 }, purchaseStatus: { type: 'string', enum: ['paid', 'pending'] }, programmes: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', required: ['programVolumeId', 'priceCents'], properties: { programVolumeId: { type: 'integer', minimum: 1 }, priceCents: { type: 'integer', minimum: 0 } } } } },
        },
        RefundRequest: { type: 'object', required: ['amountCents'], properties: { amountCents: { type: 'integer', minimum: 1, maximum: 10000000 }, customerNote: { type: 'string', maxLength: 240 }, merchantNote: { type: 'string', maxLength: 500 } } },
        ProgramRequest: { type: 'object', additionalProperties: true, description: 'Validated program name, slug, public card copy, accent, and display order.' },
        ProgramStatusRequest: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['draft', 'published', 'archived'] } } },
        VolumeRequest: { type: 'object', additionalProperties: true, description: 'Validated volume name, checkout slug, number, price in integer cents, currency, order, description, and publication state.' },
        MediaUploadRequest: { type: 'object', additionalProperties: true, description: 'Image filename, display name, alternative text, content type, byte size, and optional dimensions.' },
        FileUploadRequest: { type: 'object', additionalProperties: true, description: 'PDF filename, display name, content type, byte size, and display order.' },
        MediaMetadataRequest: { type: 'object', additionalProperties: true, description: 'Customer-facing display name or alternative text.' },
        FileMetadataRequest: { type: 'object', additionalProperties: true, description: 'Customer-facing display name or display order.' },
        FileFinalizeRequest: { type: 'object', properties: { replaceFileId: { type: 'integer', minimum: 1 } } },
        DeactivateRequest: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } },
      },
    },
  };
}

export const documentedApiEndpointCount = endpoints.length;
