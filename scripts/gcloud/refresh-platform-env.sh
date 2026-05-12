#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-/home/user/domino2}"
ENV_FILE="$ROOT_DIR/.env.platform"

if [[ ! -f "$ENV_FILE" ]]; then
  SECRET="$(openssl rand -base64 32)"
  cat > "$ENV_FILE" <<EOF
BETTER_AUTH_SECRET="$SECRET"
BETTER_AUTH_URL="https://apid.simplesoft.az"
PUBLIC_APP_ORIGIN="https://gamed.simplesoft.az"
ADMIN_APP_URL="https://admind.simplesoft.az"
GAME_WEB_URL="https://gamed.simplesoft.az"
EOF
fi

set -a
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"
pm2 restart domino-platform-api --update-env
pm2 save

echo "[refresh-platform-env] updated $ENV_FILE"
