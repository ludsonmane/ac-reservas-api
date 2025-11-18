# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# deps básicas usadas em todas as stages
# (openssl: prisma; bash: entry.sh; netcat: wait DB)
RUN apk add --no-cache openssl bash netcat-openbsd

# -------- Deps (instala node_modules sem rodar scripts) --------
FROM base AS deps
COPY package*.json ./
# evita postinstall (ex.: prisma generate) nesta fase
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder (compila nativos + build TS) --------
FROM deps AS builder
WORKDIR /app
COPY . .

# toolchain para addons nativos (argon2) e rebuild do módulo
RUN apk add --no-cache python3 make g++ \
 && npm rebuild argon2 --build-from-source

# gera Prisma Client (schema já presente aqui)
RUN npx prisma generate

# compila TypeScript -> dist
RUN npm run build

# remove devDependencies para reduzir tamanho do node_modules que será copiado
RUN npm prune --omit=dev

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# runtime precisa da libstdc++ para módulos nativos
RUN apk add --no-cache libstdc++

# copie artefatos de build e node_modules já com argon2 compilado
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# pasta para uploads locais (se usar; com S3 não é obrigatório)
RUN mkdir -p /app/uploads

# ---- ENTRYPOINT script ----
RUN printf '%s\n' \
'#!/usr/bin/env bash' \
'set -euo pipefail' \
'' \
'# Fallback: DIRECT_URL = DATABASE_URL se não vier setada' \
'export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"' \
'' \
'# Espera DB ficar de pé (TCP handshake simples)' \
'host=$(node -e '\''const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)'\'' )' \
'port=$(node -e '\''const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port || "3306")'\'' )' \
'echo "[wait-db] ${host}:${port}"' \
'for i in {1..60}; do' \
'  if nc -z "$host" "$port"; then' \
'    echo "[wait-db] OK"' \
'    break' \
'  fi' \
'  sleep 2' \
'done' \
'' \
'# Prisma: engine binária é mais estável em container' \
'export PRISMA_CLIENT_ENGINE_TYPE=binary' \
'npx prisma generate' \
'' \
'# Primeiro deploy: aplica schema direto (robusto no Railway).' \
'# Depois, quando tiver migrations versionadas, troque para "npx prisma migrate deploy".' \
'if ! npx prisma db push --accept-data-loss; then' \
'  echo "[db-push] falhou, tentando novamente em 5s..."' \
'  sleep 5' \
'  npx prisma db push --accept-data-loss' \
'fi' \
'' \
'# Descobre entrypoint automaticamente (array de candidatos)' \
'candidates=(' \
'  "dist/index.js" "dist/main.js" "dist/server.js" "dist/src/index.js"' \
'  "api/dist/index.js" "api/dist/main.js" "api/dist/server.js"' \
')' \
'entry=""' \
'for cand in "${candidates[@]}"; do' \
'  if [ -f "$cand" ]; then' \
'    entry="$cand"' \
'    break' \
'  fi' \
'done' \
'' \
'if [ -z "${entry}" ]; then' \
'  echo "[start] nenhum entrypoint encontrado. Listando dist/ e api/dist/..."' \
'  (ls -R dist || true) && (ls -R api/dist || true)' \
'  exit 1' \
'fi' \
'' \
'echo "[start] node ${entry}"' \
'exec node "${entry}"' \
> /app/entry.sh && chmod +x /app/entry.sh

EXPOSE 3000
CMD ["bash", "/app/entry.sh"]
