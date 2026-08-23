# syntax=docker/dockerfile:1
# Deploys the Nuxt admin backend (apps/admin) to Fly.io.
# Multi-stage: build the whole pnpm/turbo workspace, then ship only the
# self-contained Nitro node-server output.

# ---- base: node + pnpm via corepack ----
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---- build: install workspace deps and build the admin app ----
FROM base AS build
# Nitro's plain Node server output (no Cloudflare/Vercel adapter)
ENV NITRO_PRESET=node-server
# Copy the full monorepo (needed: pnpm workspace + turbo + shared packages)
COPY . .
RUN pnpm install --frozen-lockfile
# Builds @tilana/admin and its workspace dependencies -> apps/admin/.output
RUN pnpm build:admin

# ---- runtime: only the built server ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
WORKDIR /app
# Nitro's node-server output is fully self-contained (its own node_modules)
COPY --from=build /app/apps/admin/.output ./.output
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
