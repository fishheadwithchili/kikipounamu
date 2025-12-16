#!/bin/bash

# Get the script's parent directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Switch to project root
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Electron App..."

# 1. Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js (v18+ recommended)."
    exit 1
fi

# 2. Check and install dependencies
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   node_modules not found. Installing dependencies..."
    npm install
else
    # Simple check: if package.json is newer than node_modules, update might be needed
    if [ "package.json" -nt "node_modules" ]; then
        echo "   package.json is newer than node_modules. Updating dependencies..."
        npm install
    else
        echo "   Dependencies look up to date."
    fi
fi

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies."
    exit 1
fi

# 4. Check and install Linux system dependencies (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Detected Linux. Checking system dependencies..."
    
    REQUIRED_LIBS=("libnss3" "libatk1.0-0" "libatk-bridge2.0-0" "libcups2" "libdrm2" "libxkbcommon0" "libxcomposite1" "libxdamage1" "libxfixes3" "libxrandr2" "libgbm1" "libasound2" "xdotool" "xdg-utils")
    MISSING_LIBS=()

    for lib in "${REQUIRED_LIBS[@]}"; do
        if ! dpkg -s "$lib" &> /dev/null; then
            MISSING_LIBS+=("$lib")
        fi
    done

    if [ ${#MISSING_LIBS[@]} -ne 0 ]; then
        echo "⚠️  Missing system libraries: ${MISSING_LIBS[*]}"
        echo "🔧 Installing missing libraries (requires sudo password)..."
        
        sudo apt-get update
        sudo apt-get install -y "${MISSING_LIBS[@]}"
        
        if [ $? -ne 0 ]; then
            echo "❌ Error: Failed to install system dependencies."
            exit 1
        fi
        echo "✅ System dependencies installed."
    else
        echo "✅ All system dependencies are satisfied."
    fi
fi

# 5. Start Application
echo "⚛️ Starting Electron..."
npm run dev
