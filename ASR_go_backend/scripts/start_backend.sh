#!/bin/bash

# 获取脚本所在目录的上一级目录，即项目根目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

echo "🚀 Starting ASR Go Backend..."

# 1. 检查 Go 是否安装
if ! command -v go &> /dev/null; then
    echo "❌ Error: Go is not installed. Please install Go 1.21+."
    exit 1
fi

# 2. 检查 ffmpeg (Go Backend 需要它来处理音频格式转换)
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

# 2. 检查并安装依赖
echo "📦 Checking dependencies..."
go mod tidy
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies."
    exit 1
fi

# 3. 编译
echo "🔨 Building server..."
# 确保输出目录存在
mkdir -p bin
go build -o bin/server cmd/server/main.go
if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed."
    exit 1
fi

# 4. 运行
echo "✅ Build successful. Starting server..."
./bin/server
