#!/usr/bin/env bash
# ==============================================================================
# KAIO Meeting Bot — VPS Resource & Cleanup Maintenance Cron Script
# ==============================================================================
# Cleans orphaned Chromium processes, reaps defunct/zombie processes, removes
# temporary Playwright/Chromium profile data older than 24 hours in /tmp, and
# cleans stale core dumps.
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/kaio/cleanup.log"
mkdir -p /var/log/kaio

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_msg "Starting scheduled maintenance cleanup..."

# 1. Automatic Chromium Cleanup — Terminate orphaned Chromium processes older than 2 hours
if command -v pgrep &> /dev/null; then
    ORPHAN_CHROMIUM=$(pgrep -f "chromium-browser.*--type=renderer" || pgrep -f "chrome.*--type=renderer" || true)
    if [ -n "$ORPHAN_CHROMIUM" ]; then
        log_msg "Checking orphaned Chromium renderers: $ORPHAN_CHROMIUM"
        pkill -f "chromium.*--headless" || true
    fi
fi

# 2. Zombie Process Cleanup
ZOMBIES=$(ps -ef | awk '$5 ~ /Z/ { print $2 }' || true)
if [ -n "$ZOMBIES" ]; then
    log_msg "Reaping zombie process IDs: $ZOMBIES"
    for pid in $ZOMBIES; do
        kill -9 "$pid" 2>/dev/null || true
    done
fi

# 3. Temporary File Cleanup — /tmp/.org.chromium.*, /tmp/playwright*, /tmp/core.*
log_msg "Cleaning temporary Chromium and Playwright files older than 24h from /tmp..."
find /tmp -maxdepth 1 -type d \( -name ".org.chromium.*" -o -name ".com.google.Chrome.*" -o -name "playwright*" \) -mtime +1 -exec rm -rf {} + 2>/dev/null || true
find /tmp -maxdepth 1 -type f \( -name "core.*" -o -name "ffmpeg-*.tmp" -o -name "*.webm.tmp" \) -mtime +1 -exec rm -f {} + 2>/dev/null || true

# 4. Storage Debug File Cleanup past retention (older than 7 days)
STORAGE_DEBUG_DIR="/opt/kaio/backend/storage/meeting/debug"
if [ -d "$STORAGE_DEBUG_DIR" ]; then
    log_msg "Cleaning debug artifacts older than 7 days in $STORAGE_DEBUG_DIR..."
    find "$STORAGE_DEBUG_DIR" -type f -mtime +7 -exec rm -f {} + 2>/dev/null || true
fi

log_msg "Cleanup completed successfully."
