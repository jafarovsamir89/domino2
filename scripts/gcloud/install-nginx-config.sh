#!/usr/bin/env bash
set -euo pipefail

sudo cp /home/user/provisioning/nginx-domino2.conf /etc/nginx/sites-available/domino2.conf
sudo ln -sf /etc/nginx/sites-available/domino2.conf /etc/nginx/sites-enabled/domino2.conf
sudo nginx -t
sudo systemctl reload nginx
