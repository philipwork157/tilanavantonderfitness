# Repository agent instructions

## Mandatory project context

Read and follow [`CLAUDE.md`](./CLAUDE.md) completely before planning, reviewing,
or changing this repository. It is the canonical guide for the architecture,
database identity model, Paystack lifecycle, customer access, security
boundaries, development commands, and Git handoff conventions.

When a task changes payments, orders, refunds, entitlements, authentication,
email, private files, database relationships, or deployment, also consult:

- [`docs/database-design.md`](./docs/database-design.md)
- [`docs/deployment.md`](./docs/deployment.md)

## Non-negotiable implementation rules

- All application primary and foreign keys are auto-incrementing integers. The
  only application-schema UUID is the Supabase bridge at `users.supabase_id`.
- Store money as integer cents and treat order-item fields as immutable purchase
  snapshots.
- Follow `API route -> Zod contract -> service -> Drizzle`.
- Keep secrets and privileged packages in server-only code.
- Treat signed Paystack verification/webhooks—not browser callbacks—as payment
  and refund truth.
- Preserve database constraints, webhook idempotency, refund overage protection,
  entitlement checks, RLS, and the test/live environment boundary.
- Use forward migrations and review generated SQL before applying it.
- Preserve user changes and do not commit, deploy, or perform destructive work
  unless the user authorizes it.

## Verification and handoff

Run checks proportionate to the changed area, normally `pnpm check`,
`pnpm db:check` for schema work, and the production build for each affected app.

After every completed task that changes repository files, include one
ready-to-copy Conventional Commit message in the final response. Use
`type(scope): concise imperative summary` and describe the complete delivered
change. Do this whether or not the user explicitly asks for a commit message;
do not create the commit unless they explicitly request it.
