#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "[platform] Updating apt metadata"
sudo apt-get update

echo "[platform] Installing PostgreSQL and Nginx"
sudo apt-get install -y postgresql postgresql-contrib nginx

echo "[platform] Enabling services"
sudo systemctl enable postgresql
sudo systemctl enable nginx
sudo systemctl start postgresql
sudo systemctl start nginx

echo "[platform] Creating role and database"
sudo -u postgres psql <<'SQL'
DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_platform') THEN
    CREATE ROLE domino_platform LOGIN PASSWORD 'domino_platform_2026_ChangeMe';
  END IF;
END
$$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'domino2_platform'" | grep -q 1; then
  sudo -u postgres createdb -O domino_platform domino2_platform
fi

sudo -u postgres psql -d domino2_platform -c "GRANT ALL PRIVILEGES ON DATABASE domino2_platform TO domino_platform;"

echo "[platform] Current listening ports"
ss -tulpn | head -n 40 || true

echo "[platform] PostgreSQL status"
sudo systemctl status postgresql --no-pager || true

echo "[platform] Nginx status"
sudo systemctl status nginx --no-pager || true
