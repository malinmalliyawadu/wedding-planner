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
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrate.js ./migrate.js
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

# Apply pending migrations, then serve. Coolify provides DATABASE_URL.
CMD ["sh", "-c", "node migrate.js && node server.js"]
