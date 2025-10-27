# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl bash

# -------- Deps (dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# Evita rodar postinstall (prisma generate) antes do schema existir neste estágio
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
COPY . .
# Gera o Prisma Client (schema já existe aqui)
RUN npx prisma generate
# Compila TS -> dist
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# instala só prod deps (sem postinstall)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# artefatos
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/uploads

# a app deve respeitar process.env.PORT (Railway injeta)
EXPOSE 3000

# Entrypoint:
# - define DIRECT_URL fallback=DATABASE_URL
# - gera client
# - tenta migrate deploy 5x (retry)
# - se falhar, fallback para db push (apenas p/ 1º deploy sem migrations)
# - inicia a API
CMD bash -euxo pipefail -c '\
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}" ; \
  export PRISMA_CLIENT_ENGINE_TYPE=binary ; \
  npx prisma generate ; \
  npx prisma db push --accept-data-loss ; \
  node dist/index.js'
