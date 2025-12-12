#!/bin/bash
# Start Unified Workers for Redis Streams ASR Processing
# Uses Consumer Groups for distributed, fault-tolerant processing

set -e

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration with defaults
WORKER_COUNT="${WORKER_COUNT:-2}"
STREAM_NAME="${STREAM_NAME:-asr_tasks}"
GROUP_NAME="${CONSUMER_GROUP:-asr_workers}"
PYTHON="${PYTHON:-python3}"

echo "🚀 Redis Streams Unified Workers"
echo "================================"
echo "📡 Stream: $STREAM_NAME"
echo "👥 Group: $GROUP_NAME"
echo "🔢 Workers: $WORKER_COUNT"
echo ""

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg not found. Installing..."
    sudo apt-get update && sudo apt-get install -y ffmpeg
    if [ $? -ne 0 ]; then
         echo "❌ Error: Failed to install ffmpeg. Please install it manually."
         exit 1
    fi
    echo "✅ ffmpeg installed."
else
    echo "✅ ffmpeg found."
fi

# Check if venv exists (prefer .venv created by uv)
if [ -d ".venv" ]; then
    echo "📦 Activating virtual environment (.venv)..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "📦 Activating virtual environment (venv)..."
    source venv/bin/activate
fi

# Auto-install dependencies
echo "📦 Checking and updating dependencies..."
if command -v uv >/dev/null 2>&1; then
    echo "   Using uv to sync dependencies..."
    uv sync
else
    echo "⚠️ 'uv' not found. Falling back to pip..."
    pip install -e .
fi

# Trap to cleanup background jobs on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all workers..."
    pkill -P $$ 2>/dev/null || true
    wait
    echo "✅ All workers stopped"
}
trap cleanup SIGINT SIGTERM EXIT

# Start workers
echo ""
echo "🚀 Starting $WORKER_COUNT Unified Workers..."
for i in $(seq 1 $WORKER_COUNT); do
    WORKER_NAME="worker-$i"
    echo "   Starting $WORKER_NAME..."
    $PYTHON src/worker/unified_worker.py \
        --name "$WORKER_NAME" \
        --stream "$STREAM_NAME" \
        --group "$GROUP_NAME" &
    sleep 0.5  # Stagger startup slightly
done

echo ""
echo "✅ All workers started"
echo ""
echo "📊 Monitor stream: redis-cli XINFO STREAM $STREAM_NAME"
echo "📊 Monitor group:  redis-cli XINFO GROUPS $STREAM_NAME"
echo "📊 Monitor pending: redis-cli XPENDING $STREAM_NAME $GROUP_NAME"
echo ""
echo "Press Ctrl+C to stop all workers"

# Wait for all background jobs
wait
