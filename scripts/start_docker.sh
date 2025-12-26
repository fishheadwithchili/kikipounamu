#!/bin/bash
set -e

# Switch to project root
cd "$(dirname "$0")/.."

echo "🐳 Starting ASR Docker Environment..."

# Check for nvidia-container-toolkit (Soft Check)
if ! docker info | grep -q "Runtimes.*nvidia"; then
    echo "⚠️  WARNING: NVIDIA Runtime not detected in Docker!"
    echo "    Your workers will likely FAIL to see the GPU."
    echo "    Please run: sudo apt-get install -y nvidia-container-toolkit && sudo systemctl restart docker"
    echo "    (Proceeding anyway as requested...)"
    echo ""
fi

# Build and Start
echo "🏗️  Building images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "✅ Docker environment started!"
echo "   - API: http://localhost:8000"
echo "   - Go:  http://localhost:8081"
echo "   - View Logs: docker-compose logs -f"
