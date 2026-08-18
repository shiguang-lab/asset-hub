# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.22.0
ARG GO_VERSION=1.26.5

FROM node:${NODE_VERSION}-alpine AS node-deps
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/compute-worker/package.json apps/compute-worker/package.json
COPY apps/public-gateway/package.json apps/public-gateway/package.json
COPY apps/ssr/package.json apps/ssr/package.json
COPY packages/ai-core/package.json packages/ai-core/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/event-channel/package.json packages/event-channel/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/markdown-viewer/package.json packages/markdown-viewer/package.json
RUN pnpm config set registry "${NPM_REGISTRY}" && pnpm install --frozen-lockfile

FROM node-deps AS node-source
COPY apps/api apps/api
COPY apps/web apps/web
COPY apps/worker apps/worker
COPY apps/ssr apps/ssr
COPY packages packages

FROM node-source AS api-build
RUN pnpm --filter @shiguang/api... build
RUN pnpm --filter @shiguang/api deploy --prod --legacy /out/api
RUN test -f /out/api/dist/main.js && \
    test -f /out/api/node_modules/@shiguang/database/migrations/0001_init.sql

FROM node:${NODE_VERSION}-alpine AS api
RUN apk add --no-cache ca-certificates dumb-init tzdata
WORKDIR /app
COPY --from=api-build --chown=node:node /out/api ./
USER node
EXPOSE 3001
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]

FROM node-source AS worker-build
RUN pnpm --filter @shiguang/worker... build
RUN pnpm --filter @shiguang/worker deploy --prod --legacy /out/worker
RUN test -f /out/worker/dist/main.js

FROM node:${NODE_VERSION}-alpine AS worker
RUN apk add --no-cache ca-certificates dumb-init git openssh-client tzdata
WORKDIR /app
COPY --from=worker-build --chown=node:node /out/worker ./
RUN mkdir -p /var/lib/shiguang/worker && chown -R node:node /var/lib/shiguang/worker
USER node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]

FROM node-source AS ssr-build
RUN pnpm --filter @shiguang/ssr... build

FROM node:${NODE_VERSION}-alpine AS ssr
WORKDIR /app
ENV NODE_ENV=production
COPY --from=ssr-build /app/apps/ssr/.next/standalone ./
COPY --from=ssr-build /app/apps/ssr/.next/static ./apps/ssr/.next/static
USER node
EXPOSE 3005
CMD ["node", "apps/ssr/server.js"]

FROM node-source AS web-build
ARG VITE_UNIFIED_LOGIN_ORIGIN=https://shiguanglab.com
ARG VITE_PUBLIC_GATEWAY_BASE=https://doc.shiguanglab.com
ENV VITE_UNIFIED_LOGIN_ORIGIN=${VITE_UNIFIED_LOGIN_ORIGIN}
ENV VITE_PUBLIC_GATEWAY_BASE=${VITE_PUBLIC_GATEWAY_BASE}
RUN pnpm --filter @shiguang/web... build

FROM nginx:1.29-alpine AS web
COPY infra/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080

FROM golang:${GO_VERSION}-alpine AS compute-build
WORKDIR /src/apps/compute-worker
COPY apps/compute-worker/go.mod ./
COPY apps/compute-worker/cmd ./cmd
COPY apps/compute-worker/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/compute-worker ./cmd/compute-worker

FROM alpine:3.23 AS compute-worker
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
COPY --from=compute-build /out/compute-worker /usr/local/bin/compute-worker
USER app
EXPOSE 3002
ENTRYPOINT ["/usr/local/bin/compute-worker"]

FROM golang:${GO_VERSION}-alpine AS public-gateway-build
WORKDIR /src/apps/public-gateway
COPY apps/public-gateway/go.mod ./
COPY apps/public-gateway/cmd ./cmd
COPY apps/public-gateway/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/public-gateway ./cmd/public-gateway

FROM alpine:3.23 AS public-gateway
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
COPY --from=public-gateway-build /out/public-gateway /usr/local/bin/public-gateway
USER app
EXPOSE 3004
ENTRYPOINT ["/usr/local/bin/public-gateway"]
