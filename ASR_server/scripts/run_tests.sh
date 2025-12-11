#!/bin/bash
echo "🚀 Running Test Suite..."
pytest tests/unit tests/integration -v --tb=short
