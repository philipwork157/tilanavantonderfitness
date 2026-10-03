# Program delivery protection (ACCESS-03)

## Delivery obligation

Unpublishing or archiving stops new catalogue sales. It does not withdraw files
already owed to customers. A volume has a delivery obligation while either:

- it has an active entitlement that has not expired, including one whose start
  date is still in the future; or
- it belongs to an open Paystack checkout that can still settle, or to a paid
  Paystack payment that remains succeeded/partially refunded.

The status of the marketing program and volume does not affect this rule. The
customer listing and download route continue to use active, ready private files
after unpublishing.

## File withdrawal and replacement

The admin/API refuses to deactivate the final active, ready PDF in a bucket for
an obligated volume. The guard locks the volume before evaluating sibling files
and obligations. Checkout takes a matching key-share lock before validating the
file and reserving the order, so a file cannot disappear between catalogue
validation and order-item creation.

Private PDFs can be uploaded to draft or archived programs so sold content can
still be maintained. Replacement finalization makes the verified new PDF ready
before deactivating the old PDF, inside one database transaction. Either both
changes commit or neither does. Audit events record finalization and replacement.

The V1 upload button creates a new PDF edition within the selected volume and
atomically retires all older active PDFs for that volume after content validation.
Retired database rows and private R2 objects are retained. Volume 1 and Volume 2
remain separate products. Explicit individual replacement remains supported by
the API. Version reservations serialize on the volume, and a slow older upload
cannot replace a newer ready edition. Metadata alone is insufficient: finalization
reads the bounded, ETag-matched object and validates its PDF structure before it
becomes ready. Invalid content leaves the previous edition available.

Published volumes must fit the shared purchase-email budget: at most 15 MiB
across thirty PDFs, with known positive sizes. A published replacement/addition
that would exceed that budget is rejected before retiring any existing PDF.
Archived/draft private maintenance may retain larger files, but publication
requires an email-ready set. Publication and finalization lock the parent
program before its volumes so these rules also hold during concurrent writes.

New checkout orders pin their validated PDF editions before contacting Paystack.
Purchase email uses those retained editions and checks their content digest,
even after an administrator uploads a newer edition. Customer portal access
uses the latest active ready edition. Replacing a PDF therefore does not turn an
already-started purchase into an attachment-free email.

There is no unaudited override. If no replacement will be supplied, purchases
must complete the established refund/reversal process and non-purchase grants
must be explicitly revoked or allowed to expire before the final PDF can be
withdrawn. Merely archiving the marketing program is insufficient.

## Database boundary and rollout

Migration `20260919132857_protect_program_delivery.sql` installs a trigger that
independently rejects an update or delete that removes the final ready file
while a delivery obligation exists. It protects direct/internal database writes
in addition to the friendly application conflict. Historical inactive/pending
file cleanup remains allowed unless the file belongs to a pinned purchase.
Multiple files and atomic replacement remain
allowed.

Additive migration `20261003181008_pin_purchase_pdf_editions.sql` adds
`order_item_files` with composite purchase/volume ownership constraints, RLS,
immutable edition snapshots and protection against editing pinned storage
metadata. Normal retirement is allowed, but pinned rows/files cannot be deleted.
It does not delete or rewrite existing customer, payment or file data and does
not backfill historical purchases. Review/apply it before the new backend.

Review and apply the migration before deploying the updated admin/API. Pause
checkout, webhook/recovery and catalogue writes during the migration/version
handover. ACCESS-02 migration `20260918075403_superb_paper_doll.sql` must run
first. Preflight obligated volumes with no active ready file and repair their
metadata/R2 objects before activation; the trigger prevents new withdrawals but
does not invent or upload missing PDFs. No migration or deployment was applied
by this task.

## Verification

The disposable PostgreSQL suite verifies archived-program protection, pending
checkout protection, payment settlement after unpublishing, active and future
grants, atomic replacement, sibling-file withdrawal, expired/cancelled release,
auditing, and direct update/delete trigger enforcement. Provider events use
local fixtures and no Paystack, SES or R2 request is sent. Actual archived-file
replacement and late-payment/download behavior still require a deployed browser,
Paystack-test and private-R2 launch check.
