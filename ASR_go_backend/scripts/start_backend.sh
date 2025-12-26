#!/bin/bash

# Get the script's parent directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Switch to project root
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Go Backend..."

# ============================================================================
# LOAD PORT CONFIGURATION 
# ============================================================================

# Path to centralized .env (managed by start_api_server.sh)
KIKIPOUNAMU_ROOT="$(cd .. && pwd)"
ENV_FILE="$KIKIPOUNAMU_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
    echo "📋 Loading port configuration from $ENV_FILE"
    source "$ENV_FILE"
    echo "   Backend Port: ${ASR_BACKEND_PORT:-8081}"
    echo "   API Port:     ${ASR_API_PORT:-8000}"
else
    echo "⚠️  Port configuration not found. Using defaults."
    echo "   Please run ASR_server/scripts/start_api_server.sh first."
    ASR_BACKEND_PORT=8081
    ASR_API_PORT=8000
fi

# Export for Go process
export ASR_BACKEND_PORT ASR_API_PORT

echo ""

# ============================================================================
# END PORT CONFIGURATION
# ============================================================================

# 1. Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "⚠️  Go not found. Attempting auto-installation (v1.24.5)..."
    
    # Download
    echo "   Downloading Go 1.24.5..."
    wget -q https://go.dev/dl/go1.24.5.linux-amd64.tar.gz
    
    # Install
    echo "   Installing to /usr/local/go..."
    sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.24.5.linux-amd64.tar.gz
    rm go1.24.5.linux-amd64.tar.gz
    
    # Configure PATH for current session
    export PATH=$PATH:/usr/local/go/bin
    
    # Persist PATH to .bashrc
    if ! grep -q "/usr/local/go/bin" "$HOME/.bashrc"; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> "$HOME/.bashrc"
        echo "✅ Added Go to PATH in ~/.bashrc"
    fi
    
    echo "✅ Go installed successfully."
fi

# Re-check Go
if ! command -v go &> /dev/null; then
     # Try explicit path just in case
     export PATH=$PATH:/usr/local/go/bin
fi

if ! command -v go &> /dev/null; then
    echo "❌ Error: Auto-installation failed. Please install Go manually."
    exit 1
fi

# 2. Check ffmpeg (Required by Go Backend for audio processing)
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg not found."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "🐧 Detected Linux. Installing ffmpeg..."
        sudo apt-get update && sudo apt-get install -y ffmpeg
        if [ $? -ne 0 ]; then
             echo "❌ Error: Failed to install ffmpeg. Please install it manually."
             exit 1
        fi
    else
        echo "❌ Error: ffmpeg is missing. Please install it manually."
        echo "   Windows: https://www.gyan.dev/ffmpeg/builds/"
        echo "   MacOS: brew install ffmpeg"
        exit 1
    fi
fi

# 2. Check and install dependencies
echo "📦 Checking dependencies..."
go mod tidy
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies."
    exit 1
fi

# 3. Build
echo "🔨 Building server..."
# Ensure output directory exists
mkdir -p bin
go build -o bin/server cmd/server/main.go
if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed."
    exit 1
fi

# 4. Run
echo "✅ Build successful. Starting server..."
./bin/server
