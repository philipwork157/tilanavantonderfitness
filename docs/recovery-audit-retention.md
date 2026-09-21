# Recovery audit attribution (REAUDIT-04)

`payment_events.actor_user_id` is a nullable integer foreign key to `users.id`.
No new table is introduced. Reconcile/acknowledge actions now write the actor
in the same transaction as the recovery job mutation; a missing user causes
the entire mutation to roll back. Routes still enforce administrator role and
same-origin checks. A foreign key alone does not authorize an action.

## Retention boundary

- Actor, action (`event_type`), target (`payment_id`), event key, timestamps and
  digest remain in the existing RLS-protected ledger for its lifetime. Routine
  30-day cleanup never removes these columns.
- Database guards reject changing or deleting recovery audit metadata, including
  unlinking a deleted payment. The actor FK restricts deleting its user (including
  a cascading Supabase Auth deletion). Deactivate access instead of deleting
  an identity needed by financial history; any exceptional retention/purge change
  requires a separately reviewed migration and policy, not a runtime override.
- The existing 30-day policy still removes processed/ignored replay payloads.
  Prior recovery review text is short-lived context, not durable attribution.
  Provider events without an actor continue through normal cleanup unchanged.
- Admin replay already records actor and original event IDs in its durable
  `admin-replay:` event key. This migration addresses internal reconcile and
  acknowledge events, whose random keys previously contained no actor.

## Existing rows and deployment

Pause the recovery scheduler and administrator recovery mutations for the
version handover. Back up the target database, review and apply
`20260921051739_retain_recovery_actor.sql`, then deploy the updated writer and
cleanup code before resuming either. Old writers omit the new actor and will be
rejected after migration. An old cleanup worker must not run in the handover.
The migration locks/updates the existing ledger; plan the maintenance window
against its size. It has only been applied to disposable local test databases.

The migration backfills only positive JSON integer IDs that fit PostgreSQL's
integer range and reference an existing user. It does not infer a replacement
actor for deleted users, malformed IDs or already-redacted payloads. Find these
historical gaps after migration with this read-only query:

```sql
SELECT id, payment_id, event_type, received_at
FROM payment_events
WHERE provider = 'internal'
  AND event_type IN ('admin.recovery.reconcile', 'admin.recovery.acknowledge')
  AND actor_user_id IS NULL;
```

The new cleanup leaves unresolved legacy rows alone to preserve any remaining
evidence. Review this exception queue promptly; it is not a reason to retain
arbitrary payloads indefinitely. Where external records establish attribution,
use a reviewed corrective migration with recorded evidence. Otherwise record
the historical gap and obtain a retention decision. Already-erased attribution
cannot be reconstructed from a payload digest. Never assign the current admin
merely to clear the exception queue.

## Verification

Disposable PostgreSQL tests cover populated-schema backfill, malformed/orphaned
IDs, already-redacted rows, reconcile/acknowledge retention beyond 30 days,
normal provider cleanup, immutable metadata, user/payment deletion protection,
missing actor rejection and transaction rollback. No deployed identity,
production cleanup or real provider operation is exercised by those tests.
