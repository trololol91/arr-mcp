# Multi-stage build for arr-mcp.
# Build context: project root.

# ---- Stage 1: Builder --------------------------------------------------------
FROM node:24.13.0-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

# ---- Stage 2: Production -----------------------------------------------------
FROM node:24.13.0-alpine AS production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY package.json package-lock.json ./

ENV HUSKY=0
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
