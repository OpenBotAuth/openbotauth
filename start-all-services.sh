#!/bin/bash

# Start All OpenBotAuth Services
# This script starts all core services in the background

echo "🚀 Starting OpenBotAuth Services..."
echo ""

# Check Redis
echo "🔍 Checking Redis..."
if ! nc -z localhost 6379 2>/dev/null; then
    echo "⚠️  Redis is not running!"
    echo "   Starting Redis with Docker..."
    docker run -d --name openbotauth-redis -p 6379:6379 redis:7-alpine 2>/dev/null || \
    docker start openbotauth-redis 2>/dev/null || \
    echo "   ❌ Failed to start Redis. Please start it manually."
    sleep 2
fi

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build packages if needed
echo "🔨 Building packages..."
cd "$SCRIPT_DIR"
pnpm build > /dev/null 2>&1 || echo "   ⚠️  Build failed, continuing anyway..."
echo ""

# Start Registry Service
echo "🔐 Starting Registry Service (port 8080)..."
cd "$SCRIPT_DIR/packages/registry-service"
pnpm dev > "$SCRIPT_DIR/logs/registry.log" 2>&1 &
REGISTRY_PID=$!
echo "   PID: $REGISTRY_PID"
sleep 2

# Start Verifier Service
echo "✅ Starting Verifier Service (port 8081)..."
cd "$SCRIPT_DIR/packages/verifier-service"
pnpm dev > "$SCRIPT_DIR/logs/verifier.log" 2>&1 &
VERIFIER_PID=$!
echo "   PID: $VERIFIER_PID"
sleep 2

# Start Portal (optional)
echo "🎨 Starting Portal UI (port 5173)..."
cd "$SCRIPT_DIR/apps/registry-portal"
pnpm dev > "$SCRIPT_DIR/logs/portal.log" 2>&1 &
PORTAL_PID=$!
echo "   PID: $PORTAL_PID"
sleep 2

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Service Status:"
echo "   Registry:  http://localhost:8080 (PID: $REGISTRY_PID)"
echo "   Verifier:  http://localhost:8081 (PID: $VERIFIER_PID)"
echo "   Portal:    http://localhost:5173 (PID: $PORTAL_PID)"
echo ""
echo "📝 Logs:"
echo "   Registry:  tail -f $SCRIPT_DIR/logs/registry.log"
echo "   Verifier:  tail -f $SCRIPT_DIR/logs/verifier.log"
echo "   Portal:    tail -f $SCRIPT_DIR/logs/portal.log"
echo ""
echo "🛑 To stop all services: ./kill-services.sh"
echo ""

