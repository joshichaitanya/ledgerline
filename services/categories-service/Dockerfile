# Build context is the repo root (see docker-compose.yml / k8s/README.md),
# not this directory - needed so services/toolkit is available to copy in,
# since this service depends on it via a local `file:../toolkit` path
# (see services/toolkit/README.md - no real npm registry for this repo).
# Same pattern as auth-service.
FROM node:20-alpine AS build
WORKDIR /app
COPY services/toolkit ./services/toolkit
RUN yarn --cwd services/toolkit install && yarn --cwd services/toolkit build
COPY services/categories-service ./services/categories-service
RUN yarn --cwd services/categories-service install
RUN yarn --cwd services/categories-service build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/toolkit ./services/toolkit
COPY services/categories-service/package.json services/categories-service/yarn.lock* ./services/categories-service/
RUN yarn --cwd services/categories-service install --production
COPY --from=build /app/services/categories-service/dist ./services/categories-service/dist
# For `yarn migrate:up`, run by the init container / one-off migrate service
# before the app starts (k8s/categories-service.yaml, docker-compose.yml).
COPY services/categories-service/migrations ./services/categories-service/migrations

WORKDIR /app/services/categories-service
EXPOSE 3000
CMD ["node", "dist/index.js"]
