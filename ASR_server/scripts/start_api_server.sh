#!/bin/bash
# Start API Server
# Handles virtual environment activation and dependency checks

set -e

# Ensure we are in the project root directory
# This allows the script to be run from anywhere (e.g., ./scripts/start.sh or from root)
cd "$(dirname "$0")/.."

echo "🚀 Starting ASR API Server"
echo "=========================="
echo "📂 Working Directory: $(pwd)"

# Check for Chinese fonts
check_and_install_fonts() {
    echo "Checking for Chinese fonts..."
    if ! command -v fc-list &> /dev/null; then
        echo "Installing fontconfig..."
        sudo apt-get update && sudo apt-get install -y fontconfig
    fi

    if [ -z "$(fc-list :lang=zh)" ]; then
        echo "Chinese fonts not found. Installing fonts-noto-cjk..."
        sudo apt-get update && sudo apt-get install -y fonts-noto-cjk
        echo "Chinese fonts installed."
    else
        echo "Chinese fonts found."
    fi
}

# Check for ffmpeg
check_and_install_ffmpeg() {
    echo "Checking for ffmpeg..."
    if ! command -v ffmpeg &> /dev/null; then
        echo "ffmpeg not found. Installing..."
        sudo apt-get update && sudo apt-get install -y ffmpeg
        echo "ffmpeg installed."
    else
        echo "ffmpeg found."
    fi
}

check_and_install_fonts
check_and_install_ffmpeg

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

echo ""
echo "🚀 Launching Uvicorn..."
echo "   Host: 0.0.0.0"
echo "   Port: 8000"
echo ""

# Check for existing process on port 8000
PORT=8000
if lsof -i :$PORT > /dev/null; then
    echo "⚠️  Port $PORT is already in use."
    PID=$(lsof -t -i:$PORT)
    echo "🔄 Killing existing process (PID: $PID)..."
    kill -9 $PID
    sleep 1
    echo "✅ Port $PORT freed."
fi

# Start Uvicorn
exec uvicorn src.api.main:app --host 0.0.0.0 --port 8000
