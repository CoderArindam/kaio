FROM python:3.11-slim-bookworm

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    MEETING_HEADLESS=true \
    MEETING_FFMPEG_PATH=ffmpeg \
    MEETING_FFPROBE_PATH=ffprobe \
    RECORDING_PULSE_SOURCE=kaio_sink.monitor \
    MEETING_RECORDING_PULSE_SOURCE=kaio_sink.monitor

# Install system dependencies for Xvfb, PulseAudio, FFmpeg, Playwright Chromium, and curl for health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    gnupg \
    xvfb \
    x11-utils \
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    libasound2-plugins \
    ffmpeg \
    procps \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Upgrade pip and install Python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    playwright install --with-deps chromium && \
    pip cache purge

# Copy application source code
COPY backend/ /app/

# Ensure runtime storage directories exist
RUN mkdir -p /app/storage/meeting/profile \
             /app/storage/meeting/debug \
             /app/storage/meeting/recordings \
             /app/storage/meeting/processed_audio \
             /app/uploads

# Copy entrypoint script and make executable
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose FastAPI backend port
EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
