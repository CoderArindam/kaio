#!/usr/bin/env bash
# ==============================================================================
# KAIO Meeting Bot — VPS Firewall (UFW) Configuration Script
# ==============================================================================
# Sets up UFW rules to allow SSH, HTTP, HTTPS, and restrict direct access
# to internal Uvicorn backend port 8000.
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " KAIO VPS Firewall Configuration (UFW)"
echo "======================================================================"

if [ "$(id -u)" -ne 0 ]; then
    echo "[!] Error: This script must be run as root or using sudo." >&2
    exit 1
fi

if ! command -v ufw &> /dev/null; then
    echo "[+] Installing UFW firewall..."
    apt-get update -y && apt-get install -y ufw
fi

echo "[1/4] Setting default firewall policies..."
ufw default deny incoming
ufw default allow outgoing

echo "[2/4] Allowing SSH, HTTP, and HTTPS ports..."
ufw allow 22/tcp comment 'SSH Access'
ufw allow 80/tcp comment 'Nginx HTTP'
ufw allow 443/tcp comment 'Nginx HTTPS'

echo "[3/4] Denying public access to internal backend port 8000..."
ufw deny 8000/tcp comment 'Block direct external access to FastAPI backend' || true

echo "[4/4] Enabling UFW firewall..."
ufw --force enable

echo "======================================================================"
echo " FIREWALL STATUS:"
echo "======================================================================"
ufw status verbose
echo "======================================================================"
