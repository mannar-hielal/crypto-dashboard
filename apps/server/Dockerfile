# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
# Installs all deps (including dev) and compiles TypeScript → dist/
FROM node:24.14.1-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack (matches packageManager in package.json)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy manifests first — Docker caches this layer until deps change
COPY apps/server/package.json apps/server/pnpm-lock.yaml apps/server/

# Install ALL deps (dev included — needed for TypeScript compilation)
RUN cd apps/server && pnpm install --frozen-lockfile

# Copy source code and config
COPY apps/server/src               apps/server/src
COPY apps/server/prisma            apps/server/prisma
COPY apps/server/prisma.config.ts  apps/server/
COPY apps/server/tsconfig.json     apps/server/

# Generate Prisma client from schema, then compile TypeScript
# DATABASE_URL is a dummy — only needed so prisma generate can parse the schema at build time
RUN cd apps/server && \
    DATABASE_URL="postgresql://prisma:prisma@localhost:5432/prisma?schema=public" \
    pnpm prisma generate && pnpm build


# ─── Stage 2: Production runner ───────────────────────────────────────────────
# Lean image — only production deps + compiled output
FROM node:24.14.1-alpine AS runner

# 🔐 Non-root user — containers should never run as root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy manifests and install production dependencies only
COPY apps/server/package.json apps/server/pnpm-lock.yaml apps/server/
RUN cd apps/server && pnpm install --frozen-lockfile --prod

# Copy compiled output, Prisma assets, and runtime Prisma config from builder
COPY --from=builder /app/apps/server/dist             apps/server/dist
COPY --from=builder /app/apps/server/generated        apps/server/generated
COPY --from=builder /app/apps/server/prisma           apps/server/prisma
COPY --from=builder /app/apps/server/prisma.config.ts apps/server/prisma.config.ts

# Switch to non-root after installs (installs need root for corepack)
USER nodejs

# Set final working directory to the server app
WORKDIR /app/apps/server

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check — Fly.io and Docker will restart the container if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/src/index.js"]

