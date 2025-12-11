#!/bin/bash
# Start the Python Stream Worker
# Usage: ./scripts/start_stream_worker.sh

cd "$(dirname "$0")/.."
export PYTHONPATH=$PYTHONPATH:$(pwd)

echo "🚀 Starting Stream Worker..."
python3 src/worker/stream_worker.py
