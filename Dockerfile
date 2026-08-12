FROM node:24.18.1-alpine AS base
WORKDIR /app

RUN addgroup --system --gid 10001 app \
  && adduser --system --uid 10001 --ingroup app --no-create-home app

FROM base AS dependencies

# Copy manifests first. Workspaces are copied here so npm can resolve workspace links.
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci

FROM dependencies AS build

COPY . .

RUN npm run build \
  && npm prune --omit=dev

FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node --input-type=module --eval "const response = await fetch('http://127.0.0.1:3000/health'); if (!response.ok) process.exit(1);"

CMD ["node", "apps/api/dist/server.js"]
