FROM node:24-alpine AS build
RUN npm install --global pnpm@11.1.2
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY database database
RUN pnpm --filter @contactos/contracts build && pnpm --filter @contactos/api build && pnpm deploy --legacy --filter @contactos/api --prod /runtime

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
USER node
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /runtime/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/database ./database
COPY --from=build --chown=node:node /workspace/packages/contracts/dist ./node_modules/@contactos/contracts/dist
EXPOSE 3000
CMD ["node","apps/api/dist/main.js"]
