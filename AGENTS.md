# Repository agent instructions

## Mandatory project context

Read and follow [`CLAUDE.md`](./CLAUDE.md) completely before planning, reviewing,
or changing this repository. It is the canonical guide for the current rebuild,
security boundaries, development commands, and Git handoff conventions.

Read [`docs/admin-rebuild.md`](./docs/admin-rebuild.md) for the archive and reset
boundaries. The old admin/backend is historical reference in the ignored
`tilana-fitness-old/` folder, not an active application or migration source.

## Non-negotiable implementation rules

- Preserve the public website and shared design packages while rebuilding.
- Implement only features requested for the new admin. Do not restore archived
  business logic, tests, credentials, deployments, or migrations automatically.
- Keep website-facing contracts compatible and backend logic server-side.
- Keep secrets and privileged packages in server-only code.
- Use isolated development services. Never reset or migrate an existing remote
  database as part of this local rebuild.
- When payments/access return, verify provider evidence server-side, enforce
  ownership, and make retries idempotent. Never fabricate successful delivery.
- Preserve user changes and do not commit, deploy, or perform destructive work
  unless the user authorizes it.

## Verification and handoff

Run checks proportionate to the changed area, normally `pnpm check`, `pnpm test`,
and the production build for each affected app. Old database and financial tests
are archived. Database tests need an isolated TEST_DATABASE_URL and skip without it.

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
