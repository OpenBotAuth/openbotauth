#!/bin/bash
#
# Start the Python package test server (FastAPI)
# Port: 3001 (default) or $PORT
#
# Usage:
#   ./start-python.sh
#   PORT=3002 ./start-python.sh
#   VERIFIER_URL=https://verifier.openbotauth.org/verify ./start-python.sh

set -e

cd "$(dirname "$0")/python"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies if needed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
fi

echo "Starting Python package test server..."
python server.py
