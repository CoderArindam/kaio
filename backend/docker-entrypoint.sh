#!/usr/bin/env bash
set -e

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
SCREEN_RESOLUTION="${SCREEN_RESOLUTION:-1920x1080x24}"
SINK_NAME="${SINK_NAME:-kaio_sink}"
SINK_DESC="${SINK_DESC:-KAIO_Virtual_Audio_Sink}"

echo "======================================================================"
echo " Starting KAIO Meeting Bot Container Environment"
echo "======================================================================"

# 1. Virtual Frame Buffer (Xvfb) Display Setup
echo "[1/3] Initializing Xvfb Virtual Frame Buffer ($DISPLAY_NUM)..."
Xvfb "$DISPLAY_NUM" -screen 0 "$SCREEN_RESOLUTION" -ac +extension RANDR > /dev/null 2>&1 &
sleep 1

export DISPLAY="$DISPLAY_NUM"

# 2. Audio Server (PulseAudio) Setup
echo "[2/3] Initializing PulseAudio daemon & virtual null-sink..."
pulseaudio --start --exit-idle-time=-1 --daemonize=yes || true
sleep 1

if pactl info > /dev/null 2>&1; then
    if ! pactl list sinks short | grep -q "$SINK_NAME"; then
        pactl load-module module-null-sink sink_name="$SINK_NAME" sink_properties=device.description="$SINK_DESC" || true
    fi
    pactl set-default-sink "$SINK_NAME" || true
    pactl set-default-source "$SINK_NAME.monitor" || true
    echo "  [✓] Audio sink '$SINK_NAME' and monitor source '$SINK_NAME.monitor' ready."
else
    echo "  [!] Warning: PulseAudio daemon check failed." >&2
fi

# 3. Environment defaults
export RECORDING_PULSE_SOURCE="${RECORDING_PULSE_SOURCE:-kaio_sink.monitor}"
export MEETING_RECORDING_PULSE_SOURCE="${MEETING_RECORDING_PULSE_SOURCE:-kaio_sink.monitor}"
export MEETING_HEADLESS="${MEETING_HEADLESS:-true}"
export MEETING_FFMPEG_PATH="${MEETING_FFMPEG_PATH:-ffmpeg}"
export MEETING_FFPROBE_PATH="${MEETING_FFPROBE_PATH:-ffprobe}"

echo "======================================================================"
echo " Executing Container Command: $@"
echo "======================================================================"

# Use exec to ensure signals (SIGTERM/SIGINT) pass directly to uvicorn
exec "$@"
