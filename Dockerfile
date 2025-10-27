# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# Prisma engines precisam de openssl
RUN apk add --no-cache openssl

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# instala TUDO (inclui devDeps: typescript, @types/node, prisma cli etc.)
RUN npm ci --no-audit --no-fund

# -------- Builder --------
FROM deps AS builder
COPY . .
# gera o Prisma Client no build (não exige DATABASE_URL)
RUN npx prisma generate
# compila TS -> dist
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# só prod deps
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# copia artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# garante pasta de uploads (se usa armazenamento local)
RUN mkdir -p /app/uploads

# Railway define PORT; sua app deve ler process.env.PORT internamente
EXPOSE 3000

# Gera Prisma Client para o ambiente final e aplica migrações na subida,
# depois inicia a API
CMD sh -c "npx prisma generate && npx prisma migrate deploy && node dist/index.js"
