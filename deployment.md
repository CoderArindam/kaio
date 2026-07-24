# KAIO Production Deployment Guide (`deployment.md`)

This guide provides complete, production-ready, step-by-step instructions for deploying the entire KAIO platform from scratch.

---

## 1. Target Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Cloudflare Pages       │
                          │   (Frontend React App)   │
                          └────────────┬─────────────┘
                                       │
                                       ▼
┌──────────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐
│   Neon PostgreSQL        │     │   Koyeb Web Service      │     │   Cloudflare R2          │
│   (Serverless Database)  │◄────┤   (FastAPI Backend API)  ├────►│   (Object Storage)       │
└──────────────────────────┘     └────────────┬─────────────┘     └──────────────────────────┘
                                              │
                                              ▼
                                 ┌──────────────────────────┐
                                 │   Ubuntu VPS             │
                                 │   (KAIO Meeting Worker)  │
                                 │   Xvfb + Pulse + FFmpeg  │
                                 └──────────────────────────┘
```

| Component | Provider / Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Cloudflare Pages | Global Edge CDN hosting static Vite/React production build |
| **Backend API** | Koyeb | Managed Docker Web Service running FastAPI application |
| **Database** | Neon PostgreSQL | Serverless PostgreSQL with auto-scaling and connection pooling |
| **Object Storage** | Cloudflare R2 | S3-compatible object storage for meeting transcripts & manifests |
| **Meeting Worker** | Ubuntu 22.04 VPS | Dedicated worker instance running Playwright, Chromium, FFmpeg, Xvfb & PulseAudio |

---

## 2. Environment Variables Matrix

### A. Backend API (Koyeb)
```env
ENVIRONMENT=production
LOG_LEVEL=INFO
PORT=8000
DATABASE_URL=postgresql://user:password@ep-cool-pool-123456.us-east-2.aws.neon.tech/kanban_test_db?sslmode=require
JWT_SECRET=your_super_secret_jwt_key_at_least_32_chars_long
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
FRONTEND_ORIGINS=https://kaio.yourdomain.com,https://app.yourdomain.com
MAX_REQUEST_SIZE_BYTES=52428800
RATE_LIMIT_PER_MINUTE=300

# Storage Config
MEETING_STORAGE_PROVIDER=r2
MEETING_R2_BUCKET_NAME=kaio-meeting-artifacts
MEETING_R2_ACCOUNT_ID=your_cloudflare_account_id
MEETING_R2_ACCESS_KEY_ID=your_r2_access_key_id
MEETING_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
MEETING_R2_ENDPOINT_URL=https://your_account_id.r2.cloudflarestorage.com

# Deepgram AI Config
MEETING_SPEECH_PROVIDER=deepgram
MEETING_DEEPGRAM_API_KEY=your_deepgram_api_key
MEETING_DEEPGRAM_MODEL=nova-3
```

### B. KAIO Meeting Worker (Ubuntu VPS)
```env
ENVIRONMENT=production
LOG_LEVEL=INFO
DISPLAY=:99
PULSE_SERVER=unix:/run/user/1000/pulse/native
RECORDING_PULSE_SOURCE=kaio_sink.monitor
MEETING_RECORDING_PULSE_SOURCE=kaio_sink.monitor
MEETING_HEADLESS=true
MEETING_FFMPEG_PATH=ffmpeg
MEETING_FFPROBE_PATH=ffprobe

DATABASE_URL=postgresql://user:password@ep-cool-pool-123456.us-east-2.aws.neon.tech/kanban_test_db?sslmode=require
JWT_SECRET=your_super_secret_jwt_key_at_least_32_chars_long
MEETING_GOOGLE_EMAIL=your_bot_google_account@gmail.com
MEETING_GOOGLE_PASSWORD=your_bot_google_password

MEETING_STORAGE_PROVIDER=r2
MEETING_R2_BUCKET_NAME=kaio-meeting-artifacts
MEETING_R2_ACCOUNT_ID=your_cloudflare_account_id
MEETING_R2_ACCESS_KEY_ID=your_r2_access_key_id
MEETING_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
MEETING_R2_ENDPOINT_URL=https://your_account_id.r2.cloudflarestorage.com

MEETING_SPEECH_PROVIDER=deepgram
MEETING_DEEPGRAM_API_KEY=your_deepgram_api_key
MEETING_DEEPGRAM_MODEL=nova-3
```

### C. Frontend (Cloudflare Pages)
```env
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

---

## 3. DNS Configuration Table

| Type | Name / Host | Target / Value | Proxy Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `@` / `app` | `kaio-frontend.pages.dev` | Proxied (Orange) | Cloudflare Pages Frontend |
| **CNAME** | `api` | `kaio-backend-app.koyeb.app` | Proxied (Orange) | Koyeb Backend API |
| **A** | `worker` | `YOUR_VPS_PUBLIC_IP` | DNS Only (Gray) | Ubuntu Meeting Worker VPS |

*Cloudflare SSL/TLS Setting*: Set Encryption Mode to **Full (strict)**.

---

## 4. Step-by-Step Installation: Empty Ubuntu Server to Live Production

### Step 1: System Package & Dependency Installation
Run the following commands on an empty Ubuntu 22.04 LTS VPS as `root`:

```bash
# Update System Packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Essential Tools, Xvfb, PulseAudio, FFmpeg, and Nginx
sudo apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg git build-essential \
    xvfb x11-utils pulseaudio pulseaudio-utils alsa-utils libasound2-plugins \
    ffmpeg procps nginx ufw logrotate cron certbot python3-certbot-nginx \
    libgbm1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 libxss1 libxtst6 \
    fonts-liberation fonts-noto-color-emoji

# Install Python 3.11 & Pip
sudo apt-get install -y python3.11 python3.11-venv python3-pip
```

### Step 2: System User & Application Setup
```bash
# Create Dedicated System User
sudo useradd -r -s /bin/bash -d /opt/kaio kaio
sudo usermod -aG audio,video kaio

# Create Application Directory
sudo mkdir -p /opt/kaio /var/log/kaio
sudo chown -R kaio:kaio /opt/kaio /var/log/kaio

# Clone Repository Code
cd /opt/kaio
sudo -u kaio git clone https://github.com/your-org/kanban-project.git .

# Create Virtual Environment & Install Dependencies
sudo -u kaio python3.11 -m venv /opt/kaio/backend/venv
sudo -u kaio /opt/kaio/backend/venv/bin/pip install --upgrade pip setuptools wheel
sudo -u kaio /opt/kaio/backend/venv/bin/pip install -r /opt/kaio/backend/requirements.txt

# Install Playwright Chromium Binaries
sudo -u kaio /opt/kaio/backend/venv/bin/playwright install --with-deps chromium
```

### Step 3: Configure Virtual Display & Audio Server
Create the environment startup script:

```bash
sudo cat << 'EOF' > /opt/kaio/deploy/vps/start_meeting_bot_env.sh
#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
SCREEN_RESOLUTION="${SCREEN_RESOLUTION:-1920x1080x24}"
SINK_NAME="${SINK_NAME:-kaio_sink}"

# Initialize Xvfb Virtual Display
Xvfb "$DISPLAY_NUM" -screen 0 "$SCREEN_RESOLUTION" -ac +extension RANDR > /dev/null 2>&1 &
sleep 1
export DISPLAY="$DISPLAY_NUM"

# Initialize PulseAudio Audio Server
pulseaudio --start --exit-idle-time=-1 --daemonize=yes || true
sleep 1

if pactl info > /dev/null 2>&1; then
    if ! pactl list sinks short | grep -q "$SINK_NAME"; then
        pactl load-module module-null-sink sink_name="$SINK_NAME" sink_properties=device.description=KAIO_Virtual_Sink || true
    fi
    pactl set-default-sink "$SINK_NAME" || true
    pactl set-default-source "$SINK_NAME.monitor" || true
fi
EOF

sudo chmod +x /opt/kaio/deploy/vps/start_meeting_bot_env.sh
sudo chown kaio:kaio /opt/kaio/deploy/vps/start_meeting_bot_env.sh
```

### Step 4: Systemd Service Registration
Register `kaio-meeting-bot.service`:

```bash
sudo cat << 'EOF' > /etc/systemd/system/kaio-meeting-bot.service
[Unit]
Description=KAIO Meeting Bot Subsystem & FastAPI Backend Worker
After=network.target sound.target
Wants=sound.target

[Service]
Type=simple
User=kaio
Group=kaio
WorkingDirectory=/opt/kaio/backend
Environment="PATH=/opt/kaio/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
Environment="DISPLAY=:99"
Environment="PULSE_SERVER=unix:/run/user/1000/pulse/native"
Environment="RECORDING_PULSE_SOURCE=kaio_sink.monitor"
Environment="MEETING_RECORDING_PULSE_SOURCE=kaio_sink.monitor"
Environment="MEETING_HEADLESS=true"
Environment="MEETING_FFMPEG_PATH=ffmpeg"
Environment="MEETING_FFPROBE_PATH=ffprobe"
EnvironmentFile=/opt/kaio/backend/.env

ExecStartPre=/bin/bash /opt/kaio/deploy/vps/start_meeting_bot_env.sh
ExecStart=/opt/kaio/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
ExecStopPost=/bin/bash /opt/kaio/deploy/vps/stop_meeting_bot_env.sh

Restart=always
RestartSec=3s
KillMode=mixed
TimeoutStopSec=30s
SendSIGKILL=yes

LimitNOFILE=65536
LimitNPROC=4096
MemoryMax=4G
MemoryHigh=3.5G

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kaio-meeting-bot.service
```

### Step 5: Nginx & SSL Setup
Configure Nginx reverse proxy on the VPS:

```bash
sudo cat << 'EOF' > /etc/nginx/sites-available/kaio
upstream kaio_backend {
    server 127.0.0.1:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name worker.yourdomain.com;

    client_max_body_size 500M;
    client_body_buffer_size 10M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://kaio_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://kaio_backend/health;
        access_log off;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/kaio /etc/nginx/sites-enabled/kaio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Obtain Free SSL Certificate via Let's Encrypt / Certbot
sudo certbot --nginx -d worker.yourdomain.com --non-interactive --agree-tos -m admin@yourdomain.com
```

### Step 6: Maintenance & Cleanup Cron Jobs
```bash
sudo cat << 'EOF' > /etc/cron.d/kaio-maintenance
# KAIO Production Maintenance & Auto-Recovery
0 * * * * root /bin/bash /opt/kaio/deploy/vps/cleanup_cron.sh >/dev/null 2>&1
*/5 * * * * root /bin/bash /opt/kaio/deploy/vps/health_check.sh --auto-recover >/dev/null 2>&1
EOF

sudo chmod 644 /etc/cron.d/kaio-maintenance
```

### Step 7: UFW Firewall Setup
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8000/tcp
sudo ufw --force enable
```

### Step 8: Start Service & Verify
```bash
sudo systemctl start kaio-meeting-bot
curl -f https://worker.yourdomain.com/health
```

---

## 5. Docker Container Deployment Commands

### Build & Push Docker Image
```bash
# Build Docker image locally or in CI/CD pipeline
docker build -t ghcr.io/your-org/kaio-backend:latest -f Dockerfile .

# Log in to GitHub Container Registry
echo $GHCR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Push image to registry
docker push ghcr.io/your-org/kaio-backend:latest
```

### Deploy to Koyeb Web Service
```bash
# Install Koyeb CLI
curl -fsSL https://download.koyeb.com/install.sh | sh

# Deploy Service on Koyeb
koyeb service create kaio-backend \
  --app kaio-prod \
  --docker ghcr.io/your-org/kaio-backend:latest \
  --ports 8000:http \
  --routes /:8000 \
  --env DATABASE_URL="postgresql://user:pass@ep-cool-pool.neon.tech/kanban_test_db?sslmode=require" \
  --env JWT_SECRET="your_production_jwt_secret" \
  --env MEETING_STORAGE_PROVIDER="r2" \
  --env MEETING_SPEECH_PROVIDER="deepgram" \
  --checks 8000:http:/health
```

---

## 6. Disaster Recovery & Backup Plan

1. **Database (Neon PostgreSQL)**:
   - Automated continuous point-in-time recovery (PITR) enabled.
   - Perform logical backup dumps before major deployments:
     ```bash
     pg_dump "$DATABASE_URL" --format=custom --file=kaio_backup_$(date +%Y%m%d).dump
     ```
2. **Object Storage (Cloudflare R2)**:
   - Versioning enabled on `kaio-meeting-artifacts` bucket.
3. **VPS Worker Snapshot**:
   - Create a cloud provider disk image snapshot of the configured Ubuntu VPS.

---

## 7. Rollback Procedure

1. **Koyeb Backend Rollback**:
   ```bash
   koyeb service rollback kaio-backend
   ```
2. **Cloudflare Pages Rollback**:
   - Go to Cloudflare Dashboard -> Pages -> Deployments -> Select previous build -> Click **Rollback to this deployment**.
3. **VPS Code Rollback**:
   ```bash
   cd /opt/kaio && sudo -u kaio git reset --hard PREVIOUS_STABLE_COMMIT
   sudo systemctl restart kaio-meeting-bot
   ```

---

## 8. Scaling & Cost Estimation

### Scaling Guidelines
- **Koyeb API Backend**: Scale horizontally from 1 to N instances based on CPU > 70%.
- **Neon PostgreSQL**: Auto-scales compute units (CU) dynamically.
- **Ubuntu VPS Worker**: Concurrency limit is `MAX_CONCURRENT_SESSIONS=3` per VPS instance (2 vCPU / 4GB RAM). Spin up additional worker VPS instances as meeting volume grows.

### Monthly Cost Estimate

| Component | Free / Dev Tier | Growth Tier (~1,000 meetings/mo) | Scale Tier (~10,000 meetings/mo) |
| :--- | :--- | :--- | :--- |
| **Cloudflare Pages** | $0.00 | $0.00 | $20.00 |
| **Koyeb Backend** | $0.00 (Free instance) | $5.40 (Micro) | $24.00 (Small 2x) |
| **Neon Postgres** | $0.00 (Free tier) | $19.00 (Pro) | $69.00 |
| **Cloudflare R2** | $0.00 (<10GB) | $2.00 | $15.00 |
| **Ubuntu VPS Worker** | $6.00 (Hetzner / DigitalOcean) | $12.00 | $48.00 (4x Workers) |
| **Deepgram STT** | Pay-as-you-go | $15.00 | $150.00 |
| **TOTAL** | **~$6.00 / month** | **~$53.40 / month** | **~$326.00 / month** |

---

## 9. Final Production Verification Checklist

Run these commands to verify the live production deployment:

```bash
# 1. Verify Backend API Health & Environment
curl -s -f https://api.yourdomain.com/health | jq .

# 2. Verify Liveness Probe
curl -s -f https://api.yourdomain.com/health/liveness | jq .

# 3. Verify Database Readiness Probe
curl -s -f https://api.yourdomain.com/health/readiness | jq .

# 4. Verify Security Headers
curl -I https://api.yourdomain.com/health

# 5. Verify VPS Worker Subsystem
curl -s -f https://worker.yourdomain.com/health | jq .
```
