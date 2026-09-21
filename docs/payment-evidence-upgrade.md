# Bounded payment evidence and SEC-02 upgrade (REAUDIT-05/06)

## Runtime retention

The server retains only typed, bounded reconciliation fields. Zod scalar
contracts live in `packages/contracts/src/payment-evidence.ts`; the event
projector explicitly selects fields and shapes the nested dispute transaction.

- Identifiers are positive safe integer numbers or tokens of at most 100 characters.
- References are tokens of at most 240 characters; states/resolutions at most
  100; channels at most 50. Tokens contain only ASCII letters, digits and
  `_ . : = + -`, not arbitrary prose.
- Amounts/fees are whole cents from zero through PostgreSQL integer maximum;
  subsequent business validation still requires appropriate positive amounts.
- Currency is three uppercase letters, environment is `test` or `live`, and
  optional timestamp strings are bounded to 64 characters with ISO-shaped syntax.
  Business processing retains its date interpretation and financial checks.
- Gateway-response free text, customer, authorization and metadata are omitted.
  Unknown events retain no arbitrary event name or data in their payload.
- Malformed retained fields are omitted and `evidenceRejected: true` is stored
  alongside safe fields. Processing records a generic failure and performs no
  financial mutation. The marker survives sanitization/replay: an invalid refund
  ID cannot become a valid identifier-less refund merely by being stripped.

Webhook signatures still use the original raw request. Digests remain based on
the original input, not its sanitized representation. Nothing here trusts browser
callbacks, changes refund matching, or grants access from incomplete evidence.

## Forward cleanup for already-upgraded databases

Review `20260921052610_bound_payment_evidence.sql`. It adds versioned SQL
projection functions and sanitizes existing **Paystack** payloads with matching
field rules. It preserves digests, event IDs/keys, payment links, processing
statuses and timestamps; already-redacted markers stay redacted. Internal
recovery metadata/payloads are untouched. No permanent table/column is added.

Pause webhook, verification, checkout, recovery and administrator replay writers
for the migration/application handover. Back up the intended database, apply
reviewed pending migrations, deploy the updated writer, then resume. Do not
leave an older writer recording shallow/unbounded evidence after cleanup. The
update scans the ledger; plan locking/maintenance time against its size.

## Databases blocked before SEC-02

The existing `20260919135337_shallow_flatman.sql` is deliberately **unchanged**.
A later migration alone cannot repair an earlier migration that cannot run.
On its preceding schema, preflight with this read-only query:

```sql
SELECT id, event_type, processing_status, jsonb_typeof(payload->'data') AS data_type
FROM payment_events
WHERE provider = 'paystack'
  AND (event_type = 'charge.success' OR event_type LIKE 'refund.%')
  AND payload->'data' IS NOT NULL
  AND jsonb_typeof(payload->'data') <> 'object';
```

Missing keys are safe for the original migration; JSON `null`, arrays and scalar
values are not. Review the results and original evidence under restricted access.
Do not print full payloads into logs or tickets.

With all payment writers/workers stopped and a verified backup, review and run
`scripts/prepare-sec02-upgrade.sql` **only before SEC-02**:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --file scripts/prepare-sec02-upgrade.sql
pnpm db:migrate
```

Use the intended direct migration connection, not an unreviewed local `.env`
fallback. This is an operational instruction, not authorization to modify a
deployed database automatically.

Preparation takes an exclusive ledger lock and changes only impossible
charge/refund data shapes to empty objects. It saves their original JSONB SHA-256
digests in a temporary `retention_upgrade_digest` column; it copies no raw
payloads. It can be retried before SEC-02 without changing the original digest.
It refuses a database where SEC-02's `payload_digest` already exists. A failed
run rolls back; do not manually mark the migration applied.

Run all pending migrations through the new forward cleanup. SEC-02 introduces
its mandatory digest column; the final migration restores saved original
digests and removes the temporary column. Valid replay evidence and internal
actor metadata are preserved. Impossible evidence receives a rejection marker;
it is not fabricated into valid financial evidence. Keep writers stopped until
the new application is deployed: older writers do not supply the non-null digest
and must not run against the upgraded schema.

## Verification and remaining launch work

Tests upgrade a populated preceding-version database with valid, missing,
JSON-null, array/scalar, nested-sensitive and oversized fields. They reproduce
the unchanged migration failure, exercise preparation twice, verify digests,
internal metadata and cleanup, reject preparation after upgrade, compare SQL
and runtime scalar rules, and replay valid deferred refunds/disputes.

Only disposable local PostgreSQL is used. Deployed migrations, production
ingress/RLS, scheduler activation, provider smoke tests and email delivery remain
separate launch gates. Passing these fixes does not certify production readiness.
