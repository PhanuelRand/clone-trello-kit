FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY . .
RUN npm run typecheck && npm run build && rm -rf web/node_modules

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql postgresql-contrib postgresql-postgis \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.data && chown node:node /app/.data && chmod 700 /app/.data
USER node
ENV NODE_ENV=production PORT=3000 LOCAL_DATABASE=1 DATA_DIR=/app/.data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--env-file-if-exists=.env", "scripts/demarrer.mjs"]
