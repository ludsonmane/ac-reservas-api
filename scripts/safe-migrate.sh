#!/usr/bin/env bash
# =============================================================================
# scripts/safe-migrate.sh
#
# Wrapper seguro para comandos Prisma destrutivos.
# Bloqueia qualquer "migrate reset" ou "db push --force-reset" em produção.
#
# Uso (via package.json):
#   "db:migrate" : "bash scripts/safe-migrate.sh dev"
#   "db:reset"   : "bash scripts/safe-migrate.sh reset"
# =============================================================================

set -euo pipefail

COMMAND="${1:-}"
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# ─── Detecta ambiente ────────────────────────────────────────────────────────

NODE_ENV="${NODE_ENV:-}"
DATABASE_URL="${DATABASE_URL:-}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-}"   # Railway seta isso automaticamente
FLY_APP_NAME="${FLY_APP_NAME:-}"                 # Fly.io
RENDER_SERVICE_NAME="${RENDER_SERVICE_NAME:-}"   # Render

is_production() {
  # 1) NODE_ENV explícito
  [[ "$NODE_ENV" == "production" ]] && return 0
  # 2) Plataformas de deploy conhecidas
  [[ -n "$RAILWAY_ENVIRONMENT" && "$RAILWAY_ENVIRONMENT" == "production" ]] && return 0
  [[ -n "$FLY_APP_NAME" ]] && return 0
  [[ -n "$RENDER_SERVICE_NAME" ]] && return 0
  # 3) DATABASE_URL aponta para host remoto (não localhost / 127.0.0.1)
  if [[ -n "$DATABASE_URL" ]]; then
    if ! echo "$DATABASE_URL" | grep -qE "(localhost|127\.0\.0\.1|::1|host\.docker\.internal)"; then
      return 0
    fi
  fi
  return 1
}

# ─── Comandos SEMPRE bloqueados em produção ──────────────────────────────────

DESTRUCTIVE_COMMANDS=("reset" "force-reset")

for blocked in "${DESTRUCTIVE_COMMANDS[@]}"; do
  if [[ "$COMMAND" == "$blocked" ]] || echo "$@" | grep -q -- "--$blocked"; then
    if is_production; then
      echo ""
      echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
      echo -e "${RED}║  🚨  BLOQUEADO — AMBIENTE DE PRODUÇÃO DETECTADO          ║${NC}"
      echo -e "${RED}╠══════════════════════════════════════════════════════════╣${NC}"
      echo -e "${RED}║  Comando: prisma migrate $COMMAND                        ${NC}"
      echo -e "${RED}║                                                          ║${NC}"
      echo -e "${RED}║  Este comando APAGA TODOS OS DADOS do banco.             ║${NC}"
      echo -e "${RED}║  Ele nunca deve ser executado em produção.               ║${NC}"
      echo -e "${RED}║                                                          ║${NC}"
      echo -e "${RED}║  Se você realmente precisa fazer isso, use:              ║${NC}"
      echo -e "${RED}║    ALLOW_DESTRUCTIVE_MIGRATIONS=1 npm run db:reset       ║${NC}"
      echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
      echo ""
      exit 1
    fi

    # Em desenvolvimento: pede confirmação explícita
    echo ""
    echo -e "${YELLOW}⚠️  ATENÇÃO: 'prisma migrate reset' VAI APAGAR TODOS OS DADOS do banco!${NC}"
    echo -e "${YELLOW}   DATABASE_URL: ${DATABASE_URL:0:40}...${NC}"
    echo ""
    read -r -p "   Digite RESET para confirmar: " confirm
    if [[ "$confirm" != "RESET" ]]; then
      echo -e "${RED}Cancelado.${NC}"
      exit 1
    fi
    echo ""
  fi
done

# ─── Executa o comando Prisma real ───────────────────────────────────────────

case "$COMMAND" in
  dev)
    echo -e "${GREEN}▶ prisma migrate dev${NC}"
    npx prisma migrate dev
    ;;
  deploy)
    echo -e "${GREEN}▶ prisma migrate deploy${NC}"
    npx prisma migrate deploy
    ;;
  reset)
    # Chegou aqui: passou pela confirmação acima
    echo -e "${YELLOW}▶ prisma migrate reset${NC}"
    npx prisma migrate reset
    ;;
  *)
    echo "Uso: safe-migrate.sh [dev|deploy|reset]"
    exit 1
    ;;
esac
