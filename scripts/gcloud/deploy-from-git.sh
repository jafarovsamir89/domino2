#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$HOME/domino2}"

exec bash "$ROOT_DIR/scripts/gcloud/update-server.sh" --root "$ROOT_DIR" --platform-only
