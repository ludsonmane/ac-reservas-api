# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# Prisma engines precisam de openssl
RUN apk add --no-cache openssl

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# Evita que o postinstall rode prisma generate sem schema
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci --no-audit --no-fund

# -------- Builder --------
FROM deps AS builder
COPY . .
# gera o Prisma Client no build (não precisa de DATABASE_URL)
RUN npx prisma generate
# compila TS -> dist
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Evita prisma generate automático no postinstall
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# só prod deps
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# uploads locais (se usar)
RUN mkdir -p /app/uploads

# exponha a porta que sua app usa (ajuste se necessário)
EXPOSE 3000

# Gera client no runtime (agora com schema presente),
# aplica migrações e inicia a API
CMD sh -c "npx prisma generate && npx prisma migrate deploy && node dist/index.js"
