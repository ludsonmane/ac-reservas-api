# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl bash

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/uploads

EXPOSE 3000

# Entrypoint com retry de migrate e fallback para db push
CMD bash -euxo pipefail -c '\
  npx prisma generate ; \
  for i in 1 2 3 4 5; do \
    echo "[migrate] tentativa $i/5"; \
    if npx prisma migrate deploy; then \
      echo "[migrate] ok"; \
      break; \
    fi; \
    echo "[migrate] falhou, aguardando..."; \
    sleep 5; \
  done ; \
  # se ainda falhar, última cartada: db push (somente se você aceitar isso no primeiro deploy)
  if ! npx prisma migrate deploy; then \
    echo "[migrate] ainda falhou, tentando prisma db push (fallback)"; \
    npx prisma db push; \
  fi ; \
  node dist/index.js'
