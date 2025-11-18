# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl bash netcat-openbsd

# -------- Deps --------
FROM base AS deps
COPY package*.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# -------- Builder --------
FROM deps AS builder
WORKDIR /app
COPY . .

# toolchain p/ addons nativos + rebuild do argon2
RUN apk add --no-cache python3 make g++ \
 && npm rebuild argon2 --build-from-source \
 && ls -la node_modules/argon2 || (echo "argon2 NAO ENCONTRADO APOS REBUILD" && exit 1)

# prisma client + build TS
RUN npx prisma generate
RUN npm run build

# remove dev deps sem apagar argon2
RUN npm prune --omit=dev \
 && ls -la node_modules/argon2 || (echo "argon2 sumiu apos prune" && exit 1)

# -------- Runner --------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++

# copie node_modules COM argon2 já compilado
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# verificação extra em runtime (falha cedo se não achar)
RUN node -e "require('argon2'); console.log('argon2 ok')"

# ---- ENTRYPOINT ----
RUN printf '%s\n' \
'#!/usr/bin/env bash' \
'set -euo pipefail' \
'export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"' \
'host=$(node -e '\''const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)'\'' )' \
'port=$(node -e '\''const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port || "3306")'\'' )' \
'echo "[wait-db] ${host}:${port}"' \
'for i in {1..60}; do if nc -z "$host" "$port"; then echo "[wait-db] OK"; break; fi; sleep 2; done' \
'export PRISMA_CLIENT_ENGINE_TYPE=binary' \
'npx prisma generate' \
'if ! npx prisma db push --accept-data-loss; then sleep 5; npx prisma db push --accept-data-loss; fi' \
'candidates=("dist/index.js" "dist/main.js" "dist/server.js" "dist/src/index.js" "api/dist/index.js" "api/dist/main.js" "api/dist/server.js")' \
'entry=""' \
'for cand in "${candidates[@]}"; do [ -f "$cand" ] && entry="$cand" && break; done' \
'if [ -z "$entry" ]; then (ls -R dist || true) && (ls -R api/dist || true); exit 1; fi' \
'echo "[start] node ${entry}"' \
'exec node "${entry}"' \
> /app/entry.sh && chmod +x /app/entry.sh

EXPOSE 3000
CMD ["bash", "/app/entry.sh"]
