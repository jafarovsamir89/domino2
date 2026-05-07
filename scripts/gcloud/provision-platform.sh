#!/usr/bin/env bash
set -euo pipefail

echo "[platform] Updating apt metadata"
sudo apt-get update

echo "[platform] Installing PostgreSQL and Nginx"
sudo apt-get install -y postgresql postgresql-contrib nginx

echo "[platform] Enabling services"
sudo systemctl enable postgresql
sudo systemctl enable nginx
sudo systemctl start postgresql
sudo systemctl start nginx

echo "[platform] Applying SQL bootstrap"
sudo -u postgres psql -f /home/user/domino2/scripts/sql/bootstrap-platform.sql

echo "[platform] Current listening ports"
ss -tulpn | head -n 40 || true

echo "[platform] PostgreSQL status"
sudo systemctl status postgresql --no-pager || true

echo "[platform] Nginx status"
sudo systemctl status nginx --no-pager || true
