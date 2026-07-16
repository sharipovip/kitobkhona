# ═══════════════════════════════════════════════════════════════
# Dockerfile для GCP Cloud Run — Auth + Profiles сервис
# kitobkhona-auth/Dockerfile
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production

FROM node:20-alpine
WORKDIR /app

# Не-root пользователь для безопасности
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY server.js ./
COPY *.sql ./

# Metadata для Cloud Run
LABEL maintainer="kitobkhona"
LABEL description="Kitobkhona Auth & Profiles API"

USER appuser
EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
