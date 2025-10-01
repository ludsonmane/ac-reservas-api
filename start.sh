#!/usr/bin/env sh
set -euo pipefail
set -x

# 0) Mostra ambiente básico
echo "NODE_ENV=${NODE_ENV:-}  PORT=${PORT:-<unset>}  PWD=$(pwd)  HOSTNAME=$(hostname)"
echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# 1) Instala dependências
npm ci --prefix api || npm i --prefix api
npm ci --prefix web || npm i --prefix web

# 2) Build
npm run build --prefix api || true
npm run build --prefix web

# 3) Garante que Next ouvirá em 0.0.0.0:$PORT
#    (web/package.json deve ter: "start": "next start -H 0.0.0.0 -p $PORT")
: "${PORT:=3000}"

# 4) Sobe o WEB primeiro (em background) e valida porta
( PORT="$PORT" npm run start --prefix web ) &
WEB_PID=$!

# Espera até a porta $PORT estar aberta (máx 30s)
i=0
while [ $i -lt 30 ]; do
  # usa busybox netcat (nc) para checar o bind
  if nc -z 127.0.0.1 "$PORT" 2>/dev/null || nc -z ::1 "$PORT" 2>/dev/null; then
    echo "WEB está ouvindo em PORT=$PORT"
    break
  fi
  i=$((i+1))
  echo "Aguardando WEB escutar em $PORT... ($i/30)"
  sleep 1
done

if [ $i -ge 30 ]; then
  echo "FALHA: Next não abriu a porta $PORT"
  ps aux
  exit 1
fi

# 5) Sobe a API em 0.0.0.0:4000 (ou ajuste a porta se quiser)
PORT_API="${PORT_API:-4000}"
( PORT="$PORT_API" npm run start --prefix api ) &
API_PID=$!

echo "WEB_PID=$WEB_PID  API_PID=$API_PID  PORT=$PORT  PORT_API=$PORT_API"

# 6) Mantém o processo vivo enquanto filhos estiverem ok
wait -n
EXIT_CODE=$?
echo "Um dos processos saiu com código $EXIT_CODE"
exit $EXIT_CODE
