# The admin (apps/admin-next) for Fly.io. Built from the repository root, because
# the admin uses the shared workspace packages (@tilana/contracts, @tilana/db).
# fly.toml (development) and fly.prod.toml (production) point here.

FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm at the version pinned in package.json ("packageManager").
RUN corepack enable
WORKDIR /app

# Build the admin with all its dependencies.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tilana/admin-next..."
RUN pnpm --filter @tilana/admin-next build && rm -rf apps/admin-next/.next/cache

# Only what the admin needs to run. A normal pnpm install (not Next's traced
# "standalone" output) keeps native packages such as sharp, @napi-rs/canvas
# and pdf.js (PDF previews) where they expect to be found.
FROM base AS runtime-deps
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@tilana/admin-next..."

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=runtime-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/apps/admin-next/.next /app/apps/admin-next/.next
WORKDIR /app/apps/admin-next
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
