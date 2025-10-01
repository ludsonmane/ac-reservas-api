#!/usr/bin/env sh
set -e

# Instala deps
npm ci --prefix api
npm ci --prefix web

# Build (TS na API é opcional; se não houver build, ignora o erro)
npm run build --prefix api || true
npm run build --prefix web

# Sobe os dois processos:
# - Next (web) ESCUTA $PORT (exigência do Railway)
# - API escuta 4000 e o Next faz proxy via /api/* (configure rewrites)
( PORT="${PORT:-3000}" npm run start --prefix web & )
PORT=4000 npm run start --prefix api
