# Build context is the repo root (see docker-compose.yml / k8s/README.md),
# not this directory - needed so services/toolkit is available to copy in,
# since this service depends on it via a local `file:../toolkit` path
# (see services/toolkit/README.md - no real npm registry for this repo).
# Same pattern as auth-service.
FROM node:20-alpine AS build
WORKDIR /app
COPY services/toolkit ./services/toolkit
RUN yarn --cwd services/toolkit install && yarn --cwd services/toolkit build
COPY services/get-transactions-service ./services/get-transactions-service
RUN yarn --cwd services/get-transactions-service install
RUN yarn --cwd services/get-transactions-service build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/services/toolkit ./services/toolkit
COPY services/get-transactions-service/package.json services/get-transactions-service/yarn.lock* ./services/get-transactions-service/
RUN yarn --cwd services/get-transactions-service install --production
COPY --from=build /app/services/get-transactions-service/dist ./services/get-transactions-service/dist

WORKDIR /app/services/get-transactions-service
EXPOSE 3000
CMD ["node", "dist/index.js"]
