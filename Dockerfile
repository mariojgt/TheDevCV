# ── Stage 1: build the frontend ─────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: server production dependencies ─────────────────────
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 3: runtime ─────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8720 \
    DATA_DIR=/data
WORKDIR /app

COPY --from=server-deps /app/server/node_modules server/node_modules
COPY server/ server/
COPY --from=frontend /app/frontend/dist frontend/dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME /data
EXPOSE 8720

CMD ["node", "server/index.mjs"]
