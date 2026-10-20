# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
FROM base AS build
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Hosted builders may have slower registry egress; allow retries before failing.
RUN pnpm install --frozen-lockfile --ignore-scripts --fetch-retries=5 --fetch-timeout=120000 --network-concurrency=8
COPY . .
RUN pnpm exec prisma generate
ARG APP_REVISION=development
RUN printf '{"revision":"%s"}\n' "$APP_REVISION" > public/revision.json
ARG NEXT_PUBLIC_SITE_URL=https://mysaji.com
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
# Synthetic build-only URLs; no production secrets enter image layers.
RUN NODE_OPTIONS=--max-old-space-size=4096 DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build pnpm build
FROM build AS migration
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
FROM base AS runtime
ARG APP_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/MySaji/MySaji" org.opencontainers.image.revision=$APP_REVISION
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
