#!/bin/bash

# Start All OpenBotAuth Services
# This script starts all services in separate terminal tabs/windows

echo "🚀 Starting OpenBotAuth Services..."
echo ""

# Check if Redis is running
if ! nc -z localhost 6379 2>/dev/null; then
  echo "❌ Redis is not running on port 6379"
  echo "   Start Redis with: docker run -d -p 6379:6379 redis:7-alpine"
  exit 1
fi

echo "✅ Redis is running"

# Check if services are built
if [ ! -d "packages/registry-service/dist" ]; then
  echo "📦 Building registry-service..."
  cd packages/registry-service && pnpm build && cd ../..
fi

if [ ! -d "packages/verifier-service/dist" ]; then
  echo "📦 Building verifier-service..."
  cd packages/verifier-service && pnpm build && cd ../..
fi

echo ""
echo "Starting services..."
echo ""
echo "📋 Open these URLs:"
echo "   Registry:  http://localhost:8080/health"
echo "   Verifier:  http://localhost:8081/health"
echo "   Portal:    http://localhost:5173"
echo "   Test:      http://localhost:3000/health"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping all services..."
  kill $REGISTRY_PID $VERIFIER_PID $PORTAL_PID $TEST_PID 2>/dev/null
  exit 0
}

trap cleanup INT TERM

# Start registry service
echo "Starting registry service on port 8080..."
cd packages/registry-service
pnpm start > ../../logs/registry.log 2>&1 &
REGISTRY_PID=$!
cd ../..

# Start verifier service
echo "Starting verifier service on port 8081..."
cd packages/verifier-service
pnpm start > ../../logs/verifier.log 2>&1 &
VERIFIER_PID=$!
cd ../..

# Start portal (optional)
# echo "Starting portal on port 5173..."
# cd apps/registry-portal
# pnpm dev > ../../logs/portal.log 2>&1 &
# PORTAL_PID=$!
# cd ../..

# Start test server
echo "Starting test server on port 3000..."
node test-protected-endpoint.js > logs/test.log 2>&1 &
TEST_PID=$!

# Wait a bit for services to start
sleep 3

# Check if services are running
echo ""
echo "Checking services..."

if curl -s http://localhost:8080/health > /dev/null; then
  echo "✅ Registry service is running"
else
  echo "❌ Registry service failed to start (check logs/registry.log)"
fi

if curl -s http://localhost:8081/health > /dev/null; then
  echo "✅ Verifier service is running"
else
  echo "❌ Verifier service failed to start (check logs/verifier.log)"
fi

if curl -s http://localhost:3000/health > /dev/null; then
  echo "✅ Test server is running"
else
  echo "❌ Test server failed to start (check logs/test.log)"
fi

echo ""
echo "✅ All services started!"
echo ""
echo "📝 View logs:"
echo "   tail -f logs/registry.log"
echo "   tail -f logs/verifier.log"
echo "   tail -f logs/test.log"
echo ""
echo "🧪 Test the flow:"
echo "   cd packages/bot-cli"
echo "   pnpm dev fetch http://localhost:3000/protected -v"
echo ""

# Wait for all background processes
wait

