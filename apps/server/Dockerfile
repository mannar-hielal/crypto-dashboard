# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
# Installs all deps (including dev) and compiles TypeScript → dist/
FROM node:24.14.1-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack (matches packageManager in package.json)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy workspace manifests first — Docker caches this layer until deps change
# Using root pnpm-lock.yaml = single source of truth, same as CI
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY generated/CDSDK/package.json generated/CDSDK/

# Install ALL deps (dev included — needed for TypeScript compilation)
RUN pnpm install --frozen-lockfile

# Copy source code and config
COPY apps/server/src               apps/server/src
COPY apps/server/prisma            apps/server/prisma
COPY apps/server/prisma.config.ts  apps/server/
COPY apps/server/tsconfig.json     apps/server/
COPY generated/CDSDK               generated/CDSDK

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

# WORKDIR creates /app owned by root — give nodejs write access before switching user
# Without this, pnpm can't create temp/cache files under /app and fails with EACCES
RUN chown -R nodejs:nodejs /app

# Copy workspace manifests with correct ownership so pnpm install runs as nodejs (not root)
# Root lockfile = same versions CI tested and builder used
COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=nodejs:nodejs apps/server/package.json apps/server/
COPY --chown=nodejs:nodejs generated/CDSDK generated/CDSDK

# Switch to non-root BEFORE installing — pnpm store lands in /home/nodejs (not /root)
# This prevents module resolution errors at runtime caused by /root being unreadable by nodejs
USER nodejs

# Force pnpm (and any Node lib) to use /tmp for temp files — always writable by any user
ENV TMPDIR=/tmp

# Install only the server production dependencies from the workspace root
RUN pnpm --filter @crypto-dashboard/server install --frozen-lockfile --prod

# Copy compiled output, Prisma assets, and runtime Prisma config from builder
# --chown ensures nodejs owns all files (no root-owned files after USER switch)
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/dist             apps/server/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/generated        apps/server/generated
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/prisma           apps/server/prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/prisma.config.ts apps/server/prisma.config.ts

# Set final working directory to the server app
WORKDIR /app/apps/server

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check — Fly.io and Docker will restart the container if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/src/index.js"]
