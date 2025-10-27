# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# instala TUDO (inclui devDeps: typescript, @types/node, @types/multer, prisma cli etc.)
RUN npm ci --no-audit --no-fund

# -------- Builder --------
FROM deps AS builder
COPY . .
# gera o cliente do Prisma antes de compilar
RUN npx prisma generate
# compila TS -> dist
RUN npm run build

# -------- Runner (slim, só prod deps) --------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# apenas os manifests para reinstalar só prod
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# copia artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# se você usa uploads na máquina, garanta a pasta
RUN mkdir -p /app/uploads

# porta
EXPOSE 8080

# comando
CMD ["node", "dist/main.js"]
