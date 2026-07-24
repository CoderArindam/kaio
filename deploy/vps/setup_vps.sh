#!/usr/bin/env bash
# ==============================================================================
# KAIO Meeting Bot — VPS Master Installation & Setup Script
# ==============================================================================
# Automates full production VPS deployment:
# 1. System dependency installation
# 2. Dedicated service user ('kaio') setup
# 3. Directory structure & permissions setup
# 4. Nginx reverse proxy configuration
# 5. UFW firewall lockdown
# 6. Logrotate configuration
# 7. Systemd service registration & launch
# 8. Maintenance & cleanup cron job installation
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/kaio"

echo "======================================================================"
echo " KAIO VPS Production Deployment Installer"
echo "======================================================================"

if [ "$(id -u)" -ne 0 ]; then
    echo "[!] Error: This script must be run as root or using sudo." >&2
    exit 1
fi

echo "[1/8] Installing core system dependencies..."
bash "$SCRIPT_DIR/install_dependencies.sh"
apt-get install -y --no-install-recommends nginx ufw logrotate cron

echo "[2/8] Creating dedicated 'kaio' system user & group..."
if ! id -u kaio >/dev/null 2>&1; then
    useradd -r -s /bin/false -d "$APP_DIR" kaio
    echo "  [✓] Created system user 'kaio'."
fi
usermod -aG audio,video kaio || true

echo "[3/8] Preparing directory structure and permissions..."
mkdir -p "$APP_DIR" /var/log/kaio
chown -R kaio:kaio "$APP_DIR" /var/log/kaio
chmod 755 "$SCRIPT_DIR"/*.sh

echo "[4/8] Configuring Nginx reverse proxy..."
if [ -f "$SCRIPT_DIR/nginx-kaio.conf" ]; then
    cp "$SCRIPT_DIR/nginx-kaio.conf" /etc/nginx/sites-available/kaio
    ln -sf /etc/nginx/sites-available/kaio /etc/nginx/sites-enabled/kaio
    rm -f /etc/nginx/sites-enabled/default || true
    nginx -t
    systemctl reload nginx
    echo "  [✓] Nginx configured and reloaded."
fi

echo "[5/8] Configuring UFW Firewall..."
bash "$SCRIPT_DIR/firewall_setup.sh"

echo "[6/8] Installing logrotate configuration..."
if [ -f "$SCRIPT_DIR/logrotate-kaio.conf" ]; then
    cp "$SCRIPT_DIR/logrotate-kaio.conf" /etc/logrotate.d/kaio
    chmod 644 /etc/logrotate.d/kaio
    echo "  [✓] Installed /etc/logrotate.d/kaio."
fi

echo "[7/8] Installing systemd service..."
if [ -f "$SCRIPT_DIR/kaio-meeting-bot.service" ]; then
    cp "$SCRIPT_DIR/kaio-meeting-bot.service" /etc/systemd/system/kaio-meeting-bot.service
    systemctl daemon-reload
    systemctl enable kaio-meeting-bot.service
    echo "  [✓] Installed and enabled kaio-meeting-bot.service."
fi

echo "[8/8] Installing scheduled cleanup & health monitoring cron jobs..."
CRON_JOB="0 * * * * root /bin/bash $SCRIPT_DIR/cleanup_cron.sh >/dev/null 2>&1"
CRON_HEALTH="*/5 * * * * root /bin/bash $SCRIPT_DIR/health_check.sh --auto-recover >/dev/null 2>&1"

if [ -d /etc/cron.d ]; then
    cat <<EOF > /etc/cron.d/kaio-maintenance
# KAIO Production Maintenance & Health Monitoring
$CRON_JOB
$CRON_HEALTH
EOF
    chmod 644 /etc/cron.d/kaio-maintenance
    echo "  [✓] Installed /etc/cron.d/kaio-maintenance."
fi

echo "======================================================================"
echo " SUCCESS: VPS Production Deployment completed successfully!"
echo " Start service with: sudo systemctl start kaio-meeting-bot"
echo "======================================================================"
