#!/bin/bash

# Get the script's parent directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Switch to project root
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Go Backend..."

# 1. Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Error: Go is not installed. Please install Go 1.21+."
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
