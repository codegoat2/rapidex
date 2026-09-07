# ============================================================
# RapidEx Bot — Dockerfile
# Multi-stage build: compile TypeScript → lean production image
# ============================================================

# ---- Stage 1: Builder ----------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ---- Stage 2: Production image --------------------------------
FROM node:20-alpine AS runner

# Non-root user for security
RUN addgroup -S rapidex && adduser -S rapidex -G rapidex

WORKDIR /app

# Copy built artifacts and production node_modules
COPY --from=builder --chown=rapidex:rapidex /app/dist        ./dist
COPY --from=builder --chown=rapidex:rapidex /app/node_modules ./node_modules
COPY --from=builder --chown=rapidex:rapidex /app/package.json ./package.json

# Copy migration SQL files (needed by migrate.ts at runtime)
COPY --chown=rapidex:rapidex src/db/migrations ./dist/db/migrations

USER rapidex

# Expose webhook HTTP port
EXPOSE 3000

# Health check — Railway uses this to determine container health
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
