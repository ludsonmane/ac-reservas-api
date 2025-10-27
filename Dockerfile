# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# Prisma engines precisam de openssl
RUN apk add --no-cache openssl

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# ⚠️ NÃO rode postinstall aqui
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
COPY . .
# Gera Prisma Client (schema já existe aqui)
RUN npx prisma generate
# Compila TS -> dist
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Só prod deps (⚠️ sem postinstall!)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# Artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Pasta para uploads locais (se usar)
RUN mkdir -p /app/uploads

# Exponha a porta que sua app usa
EXPOSE 3000

# No runtime: gera client (agora com schema presente), aplica migrações e inicia
# Se você AINDA não tem migrations, troque "migrate deploy" por "db push"
CMD sh -c "npx prisma generate && npx prisma migrate deploy && node dist/index.js"
