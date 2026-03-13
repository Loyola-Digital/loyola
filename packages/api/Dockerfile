FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/api packages/api
COPY packages/shared packages/shared
RUN pnpm --filter @loyola-x/api build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY squads ./squads
EXPOSE 3001
CMD ["node", "dist/server.js"]
