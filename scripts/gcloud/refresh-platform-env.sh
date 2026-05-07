#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-/home/user/domino2}"
ENV_FILE="$ROOT_DIR/.env.platform"

if [[ ! -f "$ENV_FILE" ]]; then
  SECRET="$(openssl rand -base64 32)"
  cat > "$ENV_FILE" <<EOF
BETTER_AUTH_SECRET="$SECRET"
BETTER_AUTH_URL="http://34.28.23.216"
PUBLIC_APP_ORIGIN="http://34.28.23.216"
ADMIN_APP_URL="http://34.28.23.216"
GAME_WEB_URL="http://34.28.23.216"
EOF
fi

set -a
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"
pm2 restart domino-platform-api --update-env
pm2 save

echo "[refresh-platform-env] updated $ENV_FILE"
