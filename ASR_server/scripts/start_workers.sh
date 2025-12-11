#!/bin/bash
# Start RQ Workers for ASR Queue

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

QUEUE_NAME="${RQ_QUEUE_NAME:-asr-queue}"
REDIS_URL="redis://${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}/${REDIS_DB:-0}"
WORKER_COUNT="${RQ_WORKER_COUNT:-1}"

echo "🚀 Starting $WORKER_COUNT RQ Workers for queue: $QUEUE_NAME"
echo "📡 Redis: $REDIS_URL"

# Start workers in background
for i in $(seq 1 $WORKER_COUNT); do
    echo "Starting worker-$i..."
    rq worker $QUEUE_NAME \
        --url $REDIS_URL \
        --name worker-$i \
        --worker-class rq.SimpleWorker \
        --with-scheduler &
done

echo "✅ All workers started"
echo "📊 Monitor workers: rq info --url $REDIS_URL"
echo "🛑 Stop all workers: pkill -f 'rq worker'"

# Wait for all background jobs
wait
