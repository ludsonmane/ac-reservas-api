# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
# Prisma precisa de openssl; bash para o entrypoint; nc para esperar DB
RUN apk add --no-cache openssl bash netcat-openbsd

# -------- Deps (com dev) para compilar --------
FROM base AS deps
COPY package*.json ./
# evita postinstall rodar prisma generate sem schema
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
COPY . .
# gera Prisma Client (schema já está presente aqui)
RUN npx prisma generate
# compila TypeScript -> dist
RUN npm run build

# -------- Runner (prod) --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# instala só deps de produção (sem postinstall)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# pasta para uploads locais (se usar)
RUN mkdir -p /app/uploads

# ---- ENTRYPOINT script (em arquivo; nada de bash -c gigante) ----
RUN cat > /app/entry.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Fallback: DIRECT_URL = DATABASE_URL se não vier setada
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# Espera DB ficar de pé (TCP handshake simples)
host=$(node -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)')
port=$(node -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port || "3306")')
echo "[wait-db] ${host}:${port}"
for i in {1..60}; do
  if nc -z "$host" "$port"; then
    echo "[wait-db] OK"
    break
  fi
  sleep 2
done

# Prisma: engine binária é estável em container
export PRISMA_CLIENT_ENGINE_TYPE=binary
npx prisma generate

# Primeiro deploy: aplica schema direto (robusto no Railway).
# Quando tiver migrations versionadas, troque para "npx prisma migrate deploy".
if ! npx prisma db push --accept-data-loss; then
  echo "[db-push] falhou, tentando novamente em 5s..."
  sleep 5
  npx prisma db push --accept-data-loss
fi

# Descobre entrypoint automaticamente
entry=""
for cand in \
  dist/index.js dist/main.js dist/server.js dist/src/index.js \
  api/dist/index.js api/dist/main.js api/dist/server.js
do
  if [ -f "$cand" ]; then
    entry="$cand"
    break
  fi
done

if [ -z "${entry}" ]; then
  echo "[start] nenhum entrypoint encontrado. Listando dist/ e api/dist/..."
  (ls -R dist || true) && (ls -R api/dist || true)
  exit 1
fi

echo "[start] node ${entry}"
exec node "${entry}"
EOF
RUN chmod +x /app/entry.sh

EXPOSE 3000

# Usa o script como entrypoint
CMD ["bash", "/app/entry.sh"]
