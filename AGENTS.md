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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
