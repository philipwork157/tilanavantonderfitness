# Admin-managed program catalogue implementation plan

## Purpose

Replace the hard-coded public program catalogue with a database-backed catalogue
that Tilana can manage from the admin application. A published program must be
available for direct purchase, link to the correct Paystack order item, grant
the correct customer entitlement, and expose only the purchased private files.

This document is the agreed implementation plan. It does not describe work that
has already been completed.

## Recommendation

The current architecture is a good foundation and should be extended rather
than replaced:

- PostgreSQL remains the source of truth for programs, sellable volumes, prices,
  files, publication state, and purchase relationships.
- The Nuxt admin application owns all catalogue APIs, uploads, validation,
  authorization, and Paystack integration.
- The Astro application remains a static public website and reads published
  catalogue data from a safe, read-only Nuxt API in the browser.
- Checkout remains a direct single-program purchase. A basket is not required
  for the first version.
- Cloudflare R2 stores public marketing media and private purchased documents in
  separate buckets.
- Every application table keeps an auto-incrementing integer primary key, and
  every application foreign key uses an integer ID. The only UUID remains
  `users.supabase_id` as the Supabase Auth bridge.

The earlier plan needs four refinements:

1. Separate public media and private documents into different buckets. R2
   access is configured at bucket/domain level; a folder prefix is not a
   security boundary.
2. Separate content publishing from application deployment. Tilana should be
   able to publish a program without a GitHub credential or a code deployment.
3. Use direct browser-to-R2 uploads with short-lived, server-generated presigned
   PUT URLs. This avoids proxying large PDFs through the Fly.io application.
4. Add a stable, unique slug to each sellable volume. Checkout should resolve
   this slug to `program_volumes.id` and must not depend on a hard-coded
   TypeScript catalogue.

## Target lifecycle

```text
Admin creates program (draft)
  -> adds a sellable volume and price
  -> uploads public cover media
  -> uploads a private PDF to that volume
  -> previews and publishes the program
  -> public API exposes the published catalogue
  -> public Astro page displays it
  -> customer selects a volume and pays through Paystack
  -> order_items records program_volume_id and snapshots the price
  -> verified payment grants program_access for program_volume_id
  -> customer portal authorizes and signs a private file download
```

## Cloudflare R2 design

### Buckets

Create separate buckets for access class and environment:

| Environment | Purpose | Recommended bucket name | Public access |
| --- | --- | --- | --- |
| Development | Marketing covers and preview images | `tilanavantonder-public-media-dev` | Development URL or optional dev domain |
| Development | Purchased program PDFs | `tilanavantonder-private-programs-dev` | Disabled |
| Production | Marketing covers and preview images | `tilanavantonder-public-media-prod` | Custom domain only |
| Production | Purchased program PDFs | `tilanavantonder-private-programs-prod` | Disabled |

This prevents a test configuration from exposing or overwriting production
files. Bucket names follow R2's lowercase letters, numbers, and hyphens rule.
Use the Automatic data location unless a specific jurisdiction is deliberately
required; a bucket's jurisdiction cannot be changed after creation.

Cloudflare references:

- [Create R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)

### Public custom domain

Connect only the production public-media bucket to:

```text
media.tilanavantonder.co.za
```

Optionally connect the development public-media bucket to:

```text
media-dev.tilanavantonder.co.za
```

The Cloudflare-managed `r2.dev` URL is acceptable for development but should be
disabled on the production bucket. The custom domain is connected to the whole
bucket, not to a folder. R2 folders are only object-key prefixes and are not
independent resources or access boundaries.

Do not connect a custom domain to either private bucket. Protected downloads
will use the R2 S3 endpoint through a five-minute presigned GET URL after the
Nuxt server verifies customer access. R2 presigned URLs do not work with custom
domains.

### Object-key convention

The application should generate object keys. It must not use an untrusted
original filename as the full key, and it must not include customer names or
email addresses.

Public program media:

```text
programs/{programId}/media/{mediaId}/v{version}-{safe-name}.{extension}
```

Example:

```text
programs/12/media/31/v2-reconnect-cover.webp
```

Private program files:

```text
programs/{programId}/volumes/{volumeId}/files/{fileId}/v{version}-{safe-name}.pdf
```

Example:

```text
programs/12/volumes/18/files/44/v1-reconnect-pelvic-floor.pdf
```

The database keeps a friendly `display_name` separately. Replacing a file or
image creates a new versioned key instead of overwriting the previous object.
This makes public cache invalidation predictable and allows safe rollback.

R2 has a flat object namespace; the slashes only group keys visually. See
[R2 objects and prefixes](https://developers.cloudflare.com/r2/objects/).

### Public media delivery

- Store only images intended for public display in the public-media bucket.
- Store the bucket and object key in PostgreSQL, not a permanent full URL.
- Construct the URL from a server/public configuration value such as
  `https://media.tilanavantonder.co.za`.
- Use immutable versioned keys with a long public cache lifetime.
- Initially accept optimized JPEG, PNG, WebP, or AVIF files. Prefer WebP for
  program covers.
- Keep useful alternative text in PostgreSQL; it does not belong in the object
  filename.

A future Cloudflare Images integration can add resizing and transformations,
but it is not required for the first catalogue release.

### Private PDF delivery

- Keep both `r2.dev` and custom-domain access disabled.
- Never store or display a permanent public PDF URL.
- Keep `program_files` as metadata linked by integer
  `program_volume_id`.
- The customer endpoint must verify the signed-in user, linked client, active
  `program_access`, active program file, and matching volume.
- Only then generate a short-lived presigned GET URL using the S3 endpoint.
- Treat the signed URL as a temporary bearer credential and keep the existing
  five-minute expiry.
- Send a friendly download filename through the signed response headers where
  supported.

See [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

### Admin upload flow

Use a two-step direct upload for both cover images and PDFs:

1. The authenticated admin requests an upload from a same-origin Nuxt API.
2. The server validates the program/volume integer ID, filename, content type,
   and configured size limit.
3. The server reserves a pending integer-keyed media/file row and generates its
   object key.
4. The server returns a short-lived presigned PUT URL restricted to that key and
   content type.
5. The browser uploads directly to R2.
6. The browser calls a finalize endpoint.
7. The server performs `HEAD` against the object, verifies the expected metadata,
   and marks the row ready.
8. Only ready, active objects may be published or downloaded.

Configure R2 CORS to allow `PUT` and `HEAD` only from the real admin origins,
including the local admin origin for development. Expose `ETag` if the finalize
flow uses it. The browser never receives an R2 API access key or secret.

Use a normal single PUT for the initial release and set a sensible application
limit for PDFs. Multipart upload can be added later if program files become
large enough to require resumable uploads. See
[R2 upload options](https://developers.cloudflare.com/r2/objects/upload-objects/)
and [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/).

### Credentials

Create environment-specific, bucket-scoped R2 S3 API tokens:

- A read-only token scoped to the matching private-program bucket for customer
  download signing.
- An Object Read & Write token scoped only to the matching public-media and
  private-program buckets for authenticated admin upload/finalize operations.

Do not use an account-wide R2 Admin token in the application. Keep credentials
only in Nuxt/Fly runtime secrets. Cloudflare permits Object Read and Object Read
& Write tokens to be scoped to selected buckets. See
[R2 API token permissions](https://developers.cloudflare.com/r2/api/tokens/).

Proposed server configuration:

```text
NUXT_R2_ACCOUNT_ID
NUXT_R2_PUBLIC_MEDIA_BUCKET
NUXT_R2_PUBLIC_MEDIA_BASE_URL
NUXT_R2_PRIVATE_PROGRAM_BUCKET
NUXT_R2_DOWNLOAD_ACCESS_KEY_ID
NUXT_R2_DOWNLOAD_SECRET_ACCESS_KEY
NUXT_R2_UPLOAD_ACCESS_KEY_ID
NUXT_R2_UPLOAD_SECRET_ACCESS_KEY
```

Development and production must receive different bucket names and credentials.

## Database changes

All new IDs are generated integer primary keys. All relationships below use
integer foreign keys.

### `programs`

Keep the existing table and add the marketing and publishing fields currently
held in `apps/web/src/data/programs.ts`:

- `card_label`
- `headline`
- `description`
- `accent`
- `sort_order`
- `published_at`
- `created_by_user_id` -> `users.id`
- `updated_by_user_id` -> `users.id`

Keep `slug`, `name`, and `status`. The existing statuses remain:

- `draft`: visible only in admin/preview.
- `published`: visible on the public catalogue.
- `archived`: unavailable for new sales but retained for history and existing
  customer access.

The initial form should manage a focused marketing card/page rather than a
general drag-and-drop page builder. Structured sections can be added later if
the public program pages grow beyond the current design.

### `program_volumes`

Keep the existing relationship and pricing fields, and add:

- `slug`: unique, stable checkout identifier such as `reconnect-volume-1`.
- `sort_order`.
- `created_by_user_id` -> `users.id`.
- `updated_by_user_id` -> `users.id`.

The slug may be editable while a volume is a draft. After a volume is referenced
by an order item, changing it should require an explicit redirect/alias strategy.
The integer `program_volumes.id`, not the slug, remains the purchase and access
relationship.

A volume is purchasable only when:

- its parent program is `published`;
- the volume is published;
- its price is greater than zero;
- its currency is supported;
- it has at least one ready, active private file.

`order_items` already snapshots the name and price, so catalogue edits do not
rewrite historical purchases.

### `program_media`

Add a table for public program imagery instead of mixing public images with
private `program_files`:

- `id`: generated integer primary key.
- `program_id` -> `programs.id`.
- `kind`: initially `cover`.
- `display_name`.
- `alt_text`.
- `r2_bucket`.
- `r2_object_key`.
- `content_type`.
- `size_bytes`.
- `width` and `height` when known.
- `version`.
- `sort_order`.
- `upload_status`: `pending`, `ready`, or `failed`.
- `is_active`.
- `created_by_user_id` -> `users.id`.
- timestamps.

Only one ready, active cover should be selected for a program. Keeping media in
its own table supports versioning and a future gallery without adding more URL
columns to `programs`.

### `program_files`

Keep the existing table and add upload lifecycle/audit metadata:

- `original_filename`.
- `upload_status`: `pending`, `ready`, or `failed`.
- `etag` or checksum when available.
- `uploaded_by_user_id` -> `users.id`.

Customer queries must require both `is_active = true` and
`upload_status = 'ready'`.

### Catalogue audit events

Add an append-only `program_audit_events` table with an integer primary key,
integer `user_id`, entity type/ID, action, safe change summary, and timestamp.
At minimum, record price changes, publication changes, archives, file
replacement, and file deactivation. Do not place secrets or signed URLs in the
audit payload.

## API design

Follow the existing `route -> Zod contract -> service -> Drizzle` structure.

### Admin APIs

Provide authenticated, admin-only, same-origin routes for:

- listing and viewing programs;
- creating and updating programs;
- adding and updating volumes;
- initiating and finalizing media/PDF uploads;
- deactivating or replacing files;
- previewing validation errors;
- publishing, unpublishing, and archiving;
- reading sales/access totals for each program.

Use integer route parameters for admin entity operations. Validate every body
with shared Zod contracts. Destructive database cascades should not be exposed
as normal UI actions.

### Public catalogue API

Add read-only routes such as:

```text
GET /api/public/programs
GET /api/public/programs/:slug
GET /api/public/program-volumes/:slug
```

They may return only published marketing fields, public cover-media URLs, and
published volume prices/availability. They must never return private bucket
names, private object keys, unpublished records, audit information, or R2
credentials.

Use a short CDN/browser cache with stale-while-revalidate so admin changes
appear quickly without placing unnecessary load on PostgreSQL. Publication
mutations should invalidate any server-side catalogue cache.

## Admin user experience

Enable the existing Programs navigation item and add:

1. A list with program name, status, published volumes, current price, files,
   sales, and customer access count.
2. A create/edit screen for marketing content, accent, cover, and display order.
3. A nested volume editor for slug, volume number, price, currency, description,
   and availability.
4. A file manager for upload progress, versions, display names, ordering,
   replacement, and deactivation.
5. A preview action that uses draft data without exposing it through the public
   API.
6. Clear actions for Save draft, Publish, Unpublish, and Archive.
7. A publication checklist that explains missing requirements rather than
   allowing an incomplete sellable volume to go live.

Permanent delete should only be available for an unused draft with no order,
access, or audit references. Everything else is archived.

## Public website and checkout

### Catalogue rendering

For the first release, keep Astro static and replace the hard-coded program
array with a small client component that fetches the public catalogue API. This
allows content changes to appear without rebuilding or redeploying application
code.

The static page should provide an accessible loading state, a useful failure
state, and the general program-page metadata. The API response supplies the
cards, covers, labels, descriptions, ordering, prices, availability, and buy
links.

This choice trades program-specific server-rendered SEO content for a simpler,
safer publishing workflow. If individual program landing pages later become an
important search-acquisition channel, use one of these deliberate follow-ups:

- move only catalogue routes to Astro SSR/hybrid rendering on Cloudflare; or
- introduce a separate Git-integrated Pages project and a protected deploy hook
  that rebuilds static pages only after publish.

The current Pages projects use Direct Upload from GitHub Actions. Cloudflare
documents that Direct Upload projects cannot be switched to Git integration,
so deploy hooks should not be assumed to work with the existing projects. Code
deployment remains in the current GitHub Actions workflows.

References:

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages deploy hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)

### Checkout routing

Replace build-time checkout paths based on the hard-coded union with one generic
static checkout route, for example:

```text
/checkout?programme=reconnect-volume-1
```

The page fetches public display data by volume slug. The checkout request sends
the stable slug and the price last displayed to the customer. The Nuxt server
then:

1. validates the slug format;
2. resolves it to a published `program_volumes` row;
3. reads the authoritative integer-cent price and currency;
4. rejects stale displayed prices before Paystack opens;
5. creates `order_items.program_volume_id` using the integer ID.

Keep redirects for the existing `/checkout/{programmeKey}` URLs during the
transition so bookmarks and already-shared links continue working.

### Remove hard-coded catalogue dependencies

After backfill and validation, remove catalogue ownership from:

- `apps/web/src/data/programs.ts`;
- `packages/contracts/src/programs.ts`;
- the Paystack service's automatic catalogue row creation;
- the admin client form's static program options;
- Astro's build-time checkout path list.

`packages/contracts` should retain reusable Zod schemas and response types, not
the live catalogue records or prices.

## Rollout sequence

### Progress summary

- [x] Phase 0: architecture review and implementation plan
- [ ] Phase 1: storage prerequisites
- [ ] Phase 2: forward database migration
- [ ] Phase 3: catalogue backfill
- [ ] Phase 4: server and storage services
- [ ] Phase 5: admin UI
- [ ] Phase 6: public site and checkout cutover
- [ ] Phase 7: cleanup and verification

Mark a phase complete only after every task in that phase is checked and its
relevant verification has passed. Update the detailed task and the progress
summary together so the two views do not drift.

### Phase 0: architecture review and implementation plan

- [x] Review the existing catalogue, Paystack, customer-access, deployment, and
  R2 architecture.
- [x] Define the public/private bucket boundary, bucket names, custom domain,
  object-key conventions, and credential model.
- [x] Record the database, API, admin UI, public-site, rollout, and acceptance
  plan in this document.

### Phase 1: storage prerequisites

- [ ] Create the four R2 buckets.
- [ ] Configure public access and the custom domain only for public media.
- [ ] Confirm public access is disabled for both private-program buckets.
- [ ] Create bucket-scoped development and production download/upload tokens.
- [ ] Configure admin-origin CORS for presigned PUT/HEAD requests.
- [ ] Add runtime configuration placeholders to the application and deployment
  documentation.
- [ ] Verify the development configuration without uploading production data.

### Phase 2: forward database migration

- [ ] Extend `programs`, `program_volumes`, and `program_files`.
- [ ] Add `program_media` and `program_audit_events`.
- [ ] Add constraints and indexes.
- [ ] Generate and review a new forward Drizzle migration.
- [ ] Confirm no already-applied migration was rewritten.
- [ ] Run `pnpm db:check`.

### Phase 3: backfill

- [ ] Insert Beginner, Intermediate, Advanced, Reconnect, and Nourish from the
  current static catalogue.
- [ ] Preserve the current slugs, volume numbers, checkout keys, names, prices,
  and published/coming-soon behavior.
- [ ] Reuse existing integer program and volume rows when checkout has already
  created them.
- [ ] Verify all existing `order_items` and `program_access` relationships before
  switching reads.
- [ ] Confirm the backfill is idempotent and does not duplicate programs or
  volumes.

### Phase 4: server and storage services

- [ ] Add catalogue query/mutation services.
- [ ] Add upload initiation/finalization and R2 object verification.
- [ ] Extend private download signing without changing entitlement checks.
- [ ] Add audit events and publication validation.
- [ ] Add public catalogue read services with safe cache headers.
- [ ] Add shared Zod request/response contracts.
- [ ] Add focused service and API tests for authorization, validation, and
  storage failures.

### Phase 5: admin UI

- [ ] Enable Programs navigation.
- [ ] Build the program list and create/edit screens.
- [ ] Build volume and price management.
- [ ] Build public cover-media upload and management.
- [ ] Build private PDF upload, version, ordering, and deactivation management.
- [ ] Build preview, publication, unpublish, and archive flows.
- [ ] Display actionable upload and publication errors.
- [ ] Preserve the existing design system, accessibility, responsive behavior,
  and reduced-motion support.

### Phase 6: public site and checkout cutover

- [ ] Render program cards from the public API.
- [ ] Add accessible loading, empty, and failure states.
- [ ] Add the generic checkout route.
- [ ] Change checkout contracts and Paystack lookup to database volume slugs.
- [ ] Change the admin client assignment form to database-backed options.
- [ ] Retain existing checkout URL redirects.
- [ ] Remove automatic program/volume creation from the Paystack and client
  services.
- [ ] Verify stale-price protection and authoritative server-side pricing.

### Phase 7: cleanup and verification

- [ ] Remove the static catalogue only after data/UI parity is confirmed.
- [ ] Verify no browser bundle contains database, R2, Paystack, or service-role
  credentials.
- [ ] Run `pnpm db:check`, `pnpm check`, `pnpm build:web`, and
  `pnpm build:admin`.
- [ ] Test development and production configuration separately.
- [ ] Complete every applicable acceptance test below.
- [ ] Update `CLAUDE.md`, `docs/database-design.md`, and `docs/deployment.md` to
  match the delivered architecture.

## Acceptance tests

- [ ] An admin can create a draft without making it public.
- [ ] A program cannot be sold without a published volume, valid positive price,
  and ready private file.
- [ ] Public APIs never return drafts, archived programs, or private R2 metadata.
- [ ] A public cover loads through the configured media domain.
- [ ] A private PDF is unreachable without a valid signed URL.
- [ ] An authorized customer's signed download expires after five minutes.
- [ ] A customer cannot download another volume by changing an integer file ID.
- [ ] Checkout rejects unknown, draft, archived, unpublished, file-less, and
  zero-price volumes.
- [ ] Checkout uses the database price and rejects a stale browser price.
- [ ] Successful verified Paystack payment grants the purchased integer volume
  ID.
- [ ] Failed or abandoned payment does not grant access.
- [ ] Existing paid orders retain their historical descriptions and prices.
- [ ] Existing entitlements still resolve after the catalogue cutover.
- [ ] Full refunds revoke only purchase-derived access according to the existing
  refund rules.
- [ ] Replacing a PDF preserves the previous database/audit history and exposes
  only the current active version to customers.
- [ ] Archiving prevents new purchases without removing existing customer
  access.

## Out of scope for the first release

- Shopping basket and multi-program checkout UI.
- Coupons, subscriptions, instalments, bundles, or regional pricing.
- Drag-and-drop page building.
- Video hosting or streaming.
- Cloudflare Images transformations.
- Customer-visible file version history.
- Automatic deletion of old R2 objects.

These can be added later without changing the core integer-ID relationships.
