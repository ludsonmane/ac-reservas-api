# -------- Builder --------
FROM node:20-alpine AS builder

# Libs para prisma/bcrypt etc.
RUN apk add --no-cache openssl libc6-compat python3 make g++

WORKDIR /app

# Copia apenas o mínimo para resolver deps rapidamente
COPY package*.json ./
# Se usar pnpm/yarn, adapte:
# COPY pnpm-lock.yaml ./
# COPY yarn.lock ./

# Instala TODAS as deps (incluindo dev) para compilar e gerar Prisma
RUN npm ci

# Copia schema do Prisma antes para permitir "generate"
COPY prisma ./prisma

# Gera Prisma Client usando npx (evita issues de permissão)
RUN npx prisma generate

# Copia o resto do código
COPY . .

# Compila TS para dist (ajuste se seu script for diferente)
RUN npm run build

# -------- Runner --------
FROM node:20-alpine AS runner
WORKDIR /app

# Só o que precisa em produção
ENV NODE_ENV=production

# Copia node_modules (já com client do Prisma gerado), dist e prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
# Se você lê .env em runtime, copie também:
# COPY --from=builder /app/.env ./

# Porta padrão da sua API (ajuste se for outra)
EXPOSE 4000

# Start (ajuste se seu script for outro)
CMD ["node", "dist/server.js"]
