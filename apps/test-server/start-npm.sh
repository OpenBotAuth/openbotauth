#!/bin/bash
#
# Start the npm package test server (Express.js)
# Port: 3000 (default) or $PORT
#
# Usage:
#   ./start-npm.sh
#   PORT=3002 ./start-npm.sh
#   VERIFIER_URL=https://verifier.openbotauth.org/verify ./start-npm.sh

set -e

cd "$(dirname "$0")"

echo "Starting npm package test server..."
node npm/server.js
