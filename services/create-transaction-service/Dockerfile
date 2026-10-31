# Build context is the repo root (see docker-compose.yml / k8s/README.md),
# not this directory - needed so services/toolkit is available to copy in,
# since this service depends on it via a local `file:../toolkit` path
# (see services/toolkit/README.md - no real npm registry for this repo).
# Same pattern as auth-service.
FROM node:20-alpine AS build
WORKDIR /app
COPY services/toolkit ./services/toolkit
RUN yarn --cwd services/toolkit install && yarn --cwd services/toolkit build
COPY services/create-transaction-service ./services/create-transaction-service
RUN yarn --cwd services/create-transaction-service install
RUN yarn --cwd services/create-transaction-service build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/toolkit ./services/toolkit
COPY services/create-transaction-service/package.json services/create-transaction-service/yarn.lock* ./services/create-transaction-service/
RUN yarn --cwd services/create-transaction-service install --production
COPY --from=build /app/services/create-transaction-service/dist ./services/create-transaction-service/dist
# For `yarn migrate:up`, run by the init container / one-off migrate service
# before the app starts (k8s/create-transaction-service.yaml, docker-compose.yml).
COPY services/create-transaction-service/migrations ./services/create-transaction-service/migrations

# Also where k8s/event-store-partition-manager.yaml's `yarn partitions:manage:built` runs.
WORKDIR /app/services/create-transaction-service
EXPOSE 3000
CMD ["node", "dist/index.js"]
