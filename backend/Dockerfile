# syntax=docker/dockerfile:1.7
# Production image for the Medora API (NestJS + Prisma 7). Built in CI, never on the server.

FROM node:24-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
# prisma.config.ts reads DATABASE_URL; a placeholder is enough for `prisma generate` (never used at runtime).
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build

# ---- build: full deps, generate Prisma client, compile TypeScript ----
FROM base AS build
ARG DATABASE_URL
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="$DATABASE_URL" npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---- deps: production dependencies only ----
# @prisma/client pulls in the `prisma` CLI as a peer dependency, so `prisma migrate deploy`
# is available in the runtime image without the rest of the dev dependencies.
FROM base AS deps
ARG DATABASE_URL
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="$DATABASE_URL" npx prisma generate && test -x node_modules/.bin/prisma

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4217 \
    NODE_OPTIONS=--max-old-space-size=320 \
    PATH=/app/node_modules/.bin:$PATH
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4217
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
# API server. The maintenance worker uses the same image: `node dist/src/jobs/worker.js`.
CMD ["node", "dist/src/main.js"]
