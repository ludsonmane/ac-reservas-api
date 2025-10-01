#!/usr/bin/env sh
set -e

npm ci --prefix api
npm ci --prefix web

npm run build --prefix api || true
npm run build --prefix web

# Next na $PORT e em 0.0.0.0; API na 4000
( PORT="${PORT:-3000}" npm run start --prefix web & )
PORT=4000 npm run start --prefix api
