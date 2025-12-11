#!/bin/bash

CONCURRENCY=${1:-5}
DURATION=${2:-30}

echo "🚀 Starting Load Test"
echo "Concurrency: $CONCURRENCY"
echo "Duration: ${DURATION}s"

# Ensure resources exist
if [ ! -d "tests/resources" ]; then
    echo "Creating dummy audio resource..."
    mkdir -p tests/resources
    touch tests/resources/test_audio_short.wav # Dummy file for now if user didn't provide
fi

# Run load test
# Note: Using python -m to run from root
python3 -m tests.performance.load_test \
    --concurrency $CONCURRENCY \
    --duration $DURATION \
    --files tests/resources/test_audio_short.wav

echo "✅ Test Complete. View dashboard at http://localhost:8000/dashboard"
