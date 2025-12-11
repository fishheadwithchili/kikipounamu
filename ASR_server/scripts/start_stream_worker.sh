#!/bin/bash
# Start Stream Worker (Direct Redis Mode) for Go Backend
# This worker listens to 'asr_chunk_queue', matching the Go Backend's push target.

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "🚀 Starting Stream Worker (Direct Redis Mode)..."
echo "📡 Listening on Redis queue: asr_chunk_queue"

# Check if venv exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run the worker
python3 src/worker/stream_worker.py
