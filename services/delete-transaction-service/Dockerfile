# Build context is the repo root (see docker-compose.yml / k8s/README.md),
# not this directory - needed so services/toolkit is available to copy in,
# since this service depends on it via a local `file:../toolkit` path
# (see services/toolkit/README.md - no real npm registry for this repo).
# Same pattern as auth-service.
FROM node:20-alpine AS build
WORKDIR /app
COPY services/toolkit ./services/toolkit
RUN yarn --cwd services/toolkit install && yarn --cwd services/toolkit build
COPY services/delete-transaction-service ./services/delete-transaction-service
RUN yarn --cwd services/delete-transaction-service install
RUN yarn --cwd services/delete-transaction-service build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/toolkit ./services/toolkit
COPY services/delete-transaction-service/package.json ./services/delete-transaction-service/
RUN yarn --cwd services/delete-transaction-service install --production
COPY --from=build /app/services/delete-transaction-service/dist ./services/delete-transaction-service/dist

WORKDIR /app/services/delete-transaction-service
EXPOSE 3000
CMD ["node", "dist/index.js"]
