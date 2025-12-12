#!/bin/bash

# 获取脚本所在目录的上一级目录，即项目根目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Electron App..."

# 1. 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js (v18+ recommended)."
    exit 1
fi

# 2. 检查 pnpm 是否安装
if ! command -v pnpm &> /dev/null; then
    echo "📦 pnpm not found. Installing pnpm via npm..."
    if command -v npm &> /dev/null; then
        npm install -g pnpm
        if [ $? -ne 0 ]; then
             echo "❌ Error: Failed to install pnpm. Please install it manually."
             exit 1
        fi
    else
        echo "❌ Error: npm is not installed, cannot install pnpm automatically."
        exit 1
    fi
fi

# 3. 检查并安装依赖
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   node_modules not found. Installing dependencies..."
    pnpm install
else
    # 简单的检查，如果 package.json 比 node_modules 新，可能需要更新
    if [ "package.json" -nt "node_modules" ]; then
        echo "   package.json is newer than node_modules. Updating dependencies..."
        pnpm install
    else
        echo "   Dependencies look up to date."
    fi
fi

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies."
    exit 1
fi

# 4. 检查并安装 Linux 系统依赖 (仅限 Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Detected Linux. Checking system dependencies..."
    
    REQUIRED_LIBS=("libnss3" "libatk1.0-0" "libatk-bridge2.0-0" "libcups2" "libdrm2" "libxkbcommon0" "libxcomposite1" "libxdamage1" "libxfixes3" "libxrandr2" "libgbm1" "libasound2" "xdotool")
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

# 5. 启动应用
echo "⚛️ Starting Electron..."
pnpm dev
