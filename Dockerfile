# ============================================================
# VendorTrack — Multi-Stage Production Dockerfile
# ============================================================
# Target: Small, secure, production-ready image
# Strategy: Multi-stage build (deps → build → runtime)
# Runtime: Node.js 20 Alpine + non-root user
# ============================================================

# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables (no secrets)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the Next.js application
# The .env file is NOT copied — all secrets come from runtime env
RUN npm run build

# ---- Stage 3: Production Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9002
ENV HOSTNAME="0.0.0.0"

# Copy only the built artifacts from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy static assets for image optimization
COPY --from=builder /app/.next/server ./.next/server

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9002/api/health || exit 1

# Use non-root user
USER nextjs

# Expose application port
EXPOSE 9002

# Start the application using Next.js standalone output
CMD ["node", "server.js"]
