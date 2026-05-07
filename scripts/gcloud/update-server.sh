#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$HOME/domino2}"
BRANCH="${BRANCH:-main}"
DO_PULL=1
UPDATE_PLATFORM=1
UPDATE_LEGACY=1
RUN_CHECKS=1
CLEAN_INSTALL=0

usage() {
  cat <<'EOF'
Usage: bash scripts/gcloud/update-server.sh [options]

Options:
  --root DIR        Project directory on the VM. Default: $HOME/domino2
  --branch NAME     Git branch to deploy. Default: main
  --no-pull         Rebuild/restart current files without git pull
  --platform-only   Update only NestJS API, admin, Prisma
  --legacy-only     Update only legacy Colyseus game server
  --clean-install   Run npm ci instead of incremental npm install
  --skip-checks     Skip npm test / syntax checks
  -h, --help        Show help

Typical use on the VM:
  cd ~/domino2
  bash scripts/gcloud/update-server.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --no-pull)
      DO_PULL=0
      shift
      ;;
    --platform-only)
      UPDATE_LEGACY=0
      shift
      ;;
    --legacy-only)
      UPDATE_PLATFORM=0
      shift
      ;;
    --skip-checks)
      RUN_CHECKS=0
      shift
      ;;
    --clean-install)
      CLEAN_INSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[update] unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

log() {
  echo "[update] $*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[update] missing required command: $1" >&2
    exit 1
  fi
}

file_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$1" | awk '{print $1}'
}

install_node_deps() {
  local dir="$1"
  local install_args="${2:-}"
  local marker_dir="$ROOT_DIR/.deploy"
  local marker_name
  local marker_file
  local lock_hash
  local previous_hash=""

  mkdir -p "$marker_dir"
  marker_name="$(echo "$dir" | sed 's#[^A-Za-z0-9_.-]#_#g')"
  marker_file="$marker_dir/${marker_name}.package-lock.sha256"

  (
    cd "$dir"

    if [[ "$CLEAN_INSTALL" -eq 1 && -f package-lock.json ]]; then
      log "running clean npm install in $dir"
      npm ci $install_args
      file_hash package-lock.json > "$marker_file"
      return
    fi

    if [[ -f package-lock.json ]]; then
      lock_hash="$(file_hash package-lock.json)"
      if [[ -f "$marker_file" ]]; then
        previous_hash="$(cat "$marker_file")"
      fi

      if [[ -d node_modules && "$lock_hash" == "$previous_hash" ]]; then
        log "dependencies unchanged in $dir"
        return
      fi
    fi

    log "running incremental npm install in $dir"
    npm install --prefer-offline --no-audit --no-fund $install_args

    if [[ -f package-lock.json ]]; then
      file_hash package-lock.json > "$marker_file"
    fi
  )
}

restart_or_start_pm2() {
  local name="$1"
  local cwd="$2"
  shift 2

  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env
    return
  fi

  pm2 start "$@" --name "$name" --cwd "$cwd"
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-12}"
  local delay="${3:-3}"
  local index=1

  while [[ "$index" -le "$attempts" ]]; do
    if curl --fail --silent "$url" >/dev/null; then
      return 0
    fi

    sleep "$delay"
    index=$((index + 1))
  done

  echo "[update] health check failed: $url" >&2
  return 1
}

load_platform_env() {
  if [[ -f "$ROOT_DIR/.env.platform" ]]; then
    log "loading .env.platform"
    set -a
    source "$ROOT_DIR/.env.platform"
    set +a
  fi
}

check_clean_worktree() {
  local status
  status="$(git status --porcelain)"
  if [[ -n "$status" ]]; then
    echo "[update] git worktree is not clean. Commit/push the server changes first, or run with --no-pull to rebuild current files." >&2
    echo "$status" >&2
    exit 10
  fi
}

require_command git
require_command npm
require_command pm2
require_command curl

log "using repo: $ROOT_DIR"
cd "$ROOT_DIR"

load_platform_env

if [[ "$DO_PULL" -eq 1 ]]; then
  log "checking git state"
  check_clean_worktree

  log "pulling origin/$BRANCH"
  git fetch origin "$BRANCH" --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "skipping git pull"
fi

log "installing root workspace dependencies"
install_node_deps "$ROOT_DIR"

if [[ "$RUN_CHECKS" -eq 1 ]]; then
  log "running project checks"
  npm test
fi

if [[ "$UPDATE_PLATFORM" -eq 1 && -d packages/db && -d apps/api && -d apps/admin ]]; then
  log "generating Prisma client"
  npm run generate -w @domino2/db

  log "applying Prisma migrations"
  (
    cd packages/db
    npx prisma migrate deploy --schema prisma/schema.prisma
  )

  log "building platform API"
  npm run build -w @domino2/api

  log "building admin app"
  npm run build -w @domino2/admin

  log "restarting platform services"
  restart_or_start_pm2 domino-platform-api "$ROOT_DIR/apps/api" npm -- start
  restart_or_start_pm2 domino-platform-admin "$ROOT_DIR/apps/admin" npm -- start
fi

if [[ "$UPDATE_LEGACY" -eq 1 && -d server ]]; then
  log "installing legacy server dependencies"
  install_node_deps "$ROOT_DIR/server" "--omit=dev"

  log "restarting legacy game server"
  restart_or_start_pm2 domino-server "$ROOT_DIR/server" node index.js
fi

log "saving PM2 process list"
pm2 save

log "health checks"
if [[ "$UPDATE_PLATFORM" -eq 1 ]]; then
  wait_for_url http://127.0.0.1:3000/api/health
  wait_for_url http://127.0.0.1:3000/api/platform/status
fi

if [[ "$UPDATE_LEGACY" -eq 1 ]]; then
  wait_for_url http://127.0.0.1:2567/health
fi

log "done"
