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
COPY --from=build /app/packages/api/src/db ./src/db
COPY --from=build /app/packages/api/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/packages/api/package.json ./package.json
COPY squads ./squads
EXPOSE 3001
# node --import tsx (NÃO trocar por node puro): o pacote @loyola-x/shared é
# consumido como TS-fonte (main = src/index.ts). Desde que a API passou a
# importar um VALOR do shared (API_CONTRACT_VERSION), o index.ts é carregado em
# runtime; o type-stripping do Node 22 não resolve os re-exports ./x.js -> x.ts,
# quebrando o boot. O loader tsx resolve (mesmo comportamento do dev).
CMD ["sh", "-c", "npx drizzle-kit push --force && node --import tsx dist/server.js"]
