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
# gera o cliente do Prisma antes de compilar
RUN npx prisma generate
# compila TS -> dist
RUN npm run build

# -------- Runner (slim, só prod deps) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# apenas os manifests para reinstalar só prod
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# instala o CLI do Prisma no runner (para migrate deploy na subida)
RUN npm i -g prisma

# copia artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# se você usa uploads na máquina, garanta a pasta
RUN mkdir -p /app/uploads

# Railway injeta PORT; seu app deve escutar process.env.PORT
EXPOSE 8080

# roda migrações na subida e inicia a API
# use 'prisma' global (instalado acima). Se preferir local, troque por: npx prisma migrate deploy
CMD sh -c "prisma migrate deploy && node dist/index.js"
