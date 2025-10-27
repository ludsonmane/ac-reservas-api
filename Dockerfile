# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# precisamos de openssl (prisma), bash e netcat (espera ativa)
RUN apk add --no-cache openssl bash netcat-openbsd

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# evita rodar postinstall antes do schema existir
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
COPY . .
# gera client (schema presente aqui)
RUN npx prisma generate
# compila TS
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# só prod deps, ainda sem postinstall
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# artefatos
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/uploads

EXPOSE 3000

# Espera DB abrir porta, gera client, aplica schema e sobe
CMD bash -euxo pipefail -c '\
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}" ; \
  # Espera DB
  host=$(node -e "const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)"); \
  port=$(node -e "const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port || \"3306\")"); \
  echo \"[wait-db] ${host}:${port}\" ; for i in {1..60}; do nc -z \"$host\" \"$port\" && break || sleep 2; done ; \
  # Prisma
  export PRISMA_CLIENT_ENGINE_TYPE=binary ; \
  npx prisma generate ; \
  npx prisma db push --accept-data-loss || (echo \"[db-push] retry\" && sleep 5 && npx prisma db push --accept-data-loss) ; \
  # Descobre entrypoint
  entry=$(node -e \"const fs=require('fs');const c=['dist/index.js','dist/main.js','dist/server.js','dist/src/index.js','api/dist/index.js','api/dist/main.js','api/dist/server.js'];for(const p of c){if(fs.existsSync(p)){console.log(p);process.exit(0)}}console.error('Nenhum entrypoint encontrado:', c.join(', '));process.exit(1)\"); \
  echo \"[start] node $entry\" ; \
  node \"$entry\"'