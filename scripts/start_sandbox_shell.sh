#!/bin/bash
set -e

# Switch to project root
cd "$(dirname "$0")/.."

echo "📦 Building Clean Sandbox Environment (OS Only)..."
docker build -f docker/simulation.Dockerfile -t asr_simulator .

echo ""
echo "🚀 Entering Sandbox Shell (Empty Void)..."
echo "---------------------------------------------------"
echo "You are now root inside a clean Ubuntu 22.04 container."
echo "NO code is mounted. The directory is empty."
echo ""
echo "To simulate a new user, you should:"
echo "1. git clone https://github.com/YourRepo/kikipounamu.git"
echo "   (OR clone local: git clone /mnt/host_code my_project)"
echo "2. cd kikipounamu"
echo "3. ./scripts/start_unified_worker.sh"
echo "---------------------------------------------------"
echo "⚠️  SANDBOX NOTICE: You are inside a Docker container."
echo "   1. 'systemctl' is NOT available. Use 'service <name> start' instead."
echo "   2. Interactive apt installs may pause. Use 'export DEBIAN_FRONTEND=noninteractive' if needed."
echo "---------------------------------------------------"
echo ""

# Run interactive container
# We mount the current directory to /mnt/host_code ONLY as a read-only reference
# This allows 'git clone /mnt/host_code' if you want to test local changes without pushing.
# But the working directory starts empty.

docker run --rm -it --gpus all \
    -p 8000:8000 \
    -p 8081:8081 \
    -p 6379:6379 \
    -p 5432:5432 \
    -w /home/sim_user \
    asr_simulator \
    bash
