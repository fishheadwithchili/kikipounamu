#!/bin/bash
# Service Starter for Performance Testing
# Starts Redis, ASR Server, and RQ Worker

echo "🚀 Starting ASR System Services..."

# Check if already running
if pgrep -f "uvicorn.*8000" > /dev/null; then
    echo "⚠️  uvicorn already running on port 8000"
else
    echo "Starting uvicorn..."
    cd /home/tiger/Projects/ASR_server
    nohup uvicorn src.main:app --port 8000 > /tmp/asr_server.log 2>&1 &
    echo "✅ uvicorn started (PID: $!)"
fi

sleep 3

if pgrep -f "rq worker" > /dev/null; then
    echo "⚠️  rq worker already running"
else
    echo "Starting rq worker..."
    cd /home/tiger/Projects/ASR_server
    nohup rq worker asr-queue > /tmp/rq_worker.log 2>&1 &
    echo "✅ rq worker started (PID: $!)"
fi

sleep 2

echo ""
echo "✅ All services started!"
echo "📝 Logs:"
echo "   - ASR Server: /tmp/asr_server.log"
echo "   - RQ Worker: /tmp/rq_worker.log"
