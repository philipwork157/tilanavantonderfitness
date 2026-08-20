# Tilana van Tonder platform

A pnpm and Turborepo monorepo containing the public Astro website, the Nuxt UI admin portal, and the shared Tilana design system.

## Workspace structure

```text
apps/
  web/                 Astro public website
  admin/               Nuxt UI admin portal
packages/
  design-system/       Shared brand tokens, fonts, themes, and CSS
  ui-astro/            Shared Astro components
  ui-nuxt/             Shared Nuxt layer and Vue components
```

The public website includes Home, About, Program, Pricing, Blog, Contact, and article pages. Blog articles live in `apps/web/src/content/blog` as Markdown files.

## Local development

Install the workspace dependencies once from the repository root:

```sh
pnpm install
```

Run both applications together:

```sh
pnpm dev
```

Or run one application at a time:

```sh
pnpm dev:web
pnpm dev:admin
```

The Astro website uses port `4321`. The Nuxt admin uses port `3001` and currently starts with a branded login screen. Authentication is intentionally not connected yet.

## Build and code quality

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm check
```

Turborepo runs the relevant command in each workspace. `pnpm check` runs all lint and type-check tasks.

## Shared design system

`@tilana/design-system` owns the colour, typography, spacing, shadow, animation, and light/dark theme tokens. Framework-specific packages consume those tokens:

- `@tilana/ui-astro` exposes shared Astro presentation components.
- `@tilana/ui-nuxt` is a reusable Nuxt layer that configures Nuxt UI and exposes shared Vue components.

Keep brand decisions in the design-system package and framework behavior in the matching UI package.

## Before launch

- Replace the photo placeholders with approved photographs.
- Confirm the final program price, domain, and email address.
- Connect the contact form to an email or form service.
- Add reviewed privacy and terms pages before collecting personal information or taking payments.
- Add secure admin authentication and authorization before connecting content management.
- Have all health, exercise, nutrition, and postpartum wording reviewed by appropriately qualified professionals.
