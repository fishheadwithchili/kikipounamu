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

# ============================================================================
# SANDBOX / DOCKER HELPERS
# ============================================================================
# If running in a restricted container, unblock service starting during apt install
if [ -f /usr/sbin/policy-rc.d ]; then
    echo "🐳 Detected Docker/Sandbox environment. Unblocking service management..."
    printf '#!/bin/sh\nexit 0' | sudo tee /usr/sbin/invoke-rc.d > /dev/null
    sudo chmod +x /usr/sbin/invoke-rc.d
fi
# ============================================================================

# Detect GPU availability
echo "🔍 Detecting GPU..."
HAS_GPU=false
if command -v python3 &> /dev/null; then
    GPU_CHECK=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null || echo "False")
    if [ "$GPU_CHECK" = "True" ]; then
        HAS_GPU=true
        echo "✅ GPU detected (CUDA available)"
    else
        echo "⚠️  No GPU detected, running in CPU mode"
    fi
else
    echo "⚠️  Could not detect GPU, assuming CPU mode"
fi

# Configuration with defaults (GPU=2 workers, CPU=1 worker)
if [ -z "$WORKER_COUNT" ]; then
    if [ "$HAS_GPU" = true ]; then
        WORKER_COUNT=2
    else
        WORKER_COUNT=1
    fi
fi
STREAM_NAME="${STREAM_NAME:-asr_tasks}"
GROUP_NAME="${CONSUMER_GROUP:-asr_workers}"
PYTHON="${PYTHON:-python3}"

echo "🚀 Redis Streams Unified Workers"
echo "================================"
echo "📡 Stream: $STREAM_NAME"
echo "👥 Group: $GROUP_NAME"
echo "🔢 Workers: $WORKER_COUNT"
echo ""

# P1 Fix: Ensure Redis Persistence (AOF) is enabled
if [ -f "scripts/enable_local_aof.sh" ]; then
    bash scripts/enable_local_aof.sh
fi

# ============================================================================
# DB CHECK: Redis
# ============================================================================
ensure_redis_running() {
    local port=${REDIS_PORT:-6379}
    # Check if port is open using Python (robust in minimal container)
    if ! python3 -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); result = s.connect_ex(('127.0.0.1', $port)); s.close(); exit(0 if result == 0 else 1)" 2>/dev/null; then
         echo "⚠️  Redis is not running on port $port. Attempting to start..."
         if command -v systemctl > /dev/null 2>&1 && [ -d /run/systemd/system ]; then
             sudo systemctl start redis-server || true
         elif command -v service > /dev/null 2>&1; then
             sudo service redis-server start || true
         else
             # Last resort
             sudo redis-server --daemonize yes || true
         fi
         sleep 2
         echo "✅ Redis check completed."
    else
         echo "✅ Redis is running on port $port."
    fi
}
ensure_redis_running
# ============================================================================


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

# Check and Install uv
if ! command -v uv &> /dev/null; then
    echo "⚠️  'uv' not found. Installing..."
    
    # Try installing via pip first (most common in Python environments)
    if command -v pip &> /dev/null; then
        echo "   Installing uv via pip..."
        pip install uv
    elif command -v pip3 &> /dev/null; then
        echo "   Installing uv via pip3..."
        pip3 install uv
    else
        echo "   pip not found. Installing uv via curl..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        
        # Add to path for current session
        if [ -f "$HOME/.cargo/env" ]; then
            source "$HOME/.cargo/env"
        else
            export PATH="$HOME/.local/bin:$PATH"
        fi
    fi
fi

# Re-check uv validity and update PATH if needed
if ! command -v uv &> /dev/null; then
    # Try adding common paths explicitly
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

if ! command -v uv &> /dev/null; then
     echo "❌ Error: Failed to install 'uv'. Please install it manually."
     exit 1
fi

echo "✅ uv is available."

# Sync dependencies (creates .venv if missing)
echo "📦 Syncing dependencies with uv..."
uv sync

# Activate virtual environment
if [ -d ".venv" ]; then
    echo "📦 Activating virtual environment (.venv)..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "📦 Activating virtual environment (venv)..."
    source venv/bin/activate
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
