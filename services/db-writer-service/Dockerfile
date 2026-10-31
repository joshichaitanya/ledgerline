FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --production --frozen-lockfile
COPY --from=build /app/dist ./dist
# For `yarn migrate:transactions:up`, run by the init container / one-off
# migrate service before the app starts (k8s/db-writer-service.yaml,
# docker-compose.yml).
COPY migrations ./migrations

CMD ["node", "dist/index.js"]
