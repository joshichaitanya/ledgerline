# Build context is the repo root (see docker-compose.yml / k8s/README.md),
# not this directory - needed so services/toolkit is available to copy in,
# since auth-service depends on it via a local `file:../toolkit` path
# (see services/toolkit/README.md - no real npm registry for this repo).
FROM node:20-alpine AS build
WORKDIR /app
COPY services/toolkit ./services/toolkit
RUN yarn --cwd services/toolkit install && yarn --cwd services/toolkit build
COPY services/auth-service ./services/auth-service
RUN yarn --cwd services/auth-service install
RUN yarn --cwd services/auth-service build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/toolkit ./services/toolkit
COPY services/auth-service/package.json ./services/auth-service/package.json
RUN yarn --cwd services/auth-service install --production
COPY --from=build /app/services/auth-service/dist ./services/auth-service/dist
# For `yarn migrate:up`, run by the init container / one-off migrate service
# before the app starts (k8s/auth-service.yaml, docker-compose.yml).
COPY services/auth-service/migrations ./services/auth-service/migrations

WORKDIR /app/services/auth-service
EXPOSE 3000
CMD ["node", "dist/index.js"]
