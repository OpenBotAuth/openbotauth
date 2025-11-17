#!/bin/bash

# Kill all OpenBotAuth services

echo "🛑 Stopping OpenBotAuth services..."

# Kill by port
for port in 8080 8081 3000 5173; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null
    echo "✅ Killed process on port $port (PID: $pid)"
  else
    echo "⚪ No process on port $port"
  fi
done

echo ""
echo "✅ All services stopped"

