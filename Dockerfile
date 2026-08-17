# Build stage
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# DATABASE_URL is not needed at build time: every page is force-dynamic,
# so nothing touches the database during `next build`.
RUN pnpm build

# Bundle the migration runner so the runtime image needs no dev deps.
RUN pnpm exec esbuild src/db/migrate.ts --bundle --platform=node \
    --outfile=migrate.js --external:pg-native

# Runtime stage
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    # Bind to every interface; localhost would be unreachable from
    # outside the container.
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Nothing here needs root. The user is created before the copies so
# --chown can set ownership in place; a `chown -R` afterwards would
# duplicate every file into a second layer.
RUN addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/migrate.js ./migrate.js
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# The run sheet PDFs embed these; they are read from process.cwd() at
# request time and standalone output tracing does not know about them.
COPY --from=builder --chown=nextjs:nodejs /app/src/assets/fonts ./src/assets/fonts

USER nextjs

EXPOSE 3000

# Coolify reads this; it probes from inside Docker, so it presents no
# session cookie. /api/health is exempt from the sign-in for exactly that
# reason - see needsSession in src/proxy.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then serve. Coolify provides DATABASE_URL.
CMD ["sh", "-c", "node migrate.js && node server.js"]
