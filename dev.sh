#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing processes on our ports
echo "Stopping old servers..."
fuser -k 18000/tcp 2>/dev/null
fuser -k 18001/tcp 2>/dev/null
sleep 2

# Double-check and force kill
fuser -k -9 18000/tcp 2>/dev/null
fuser -k -9 18001/tcp 2>/dev/null
sleep 1

# Also kill by process name pattern
pkill -f "next dev" 2>/dev/null
pkill -f "backend/server" 2>/dev/null
sleep 1

# Load .env file if it exists
if [ -f "$DIR/backend/.env" ]; then
    echo "Loading environment variables from .env..."
    export $(grep -v '^#' "$DIR/backend/.env" | xargs)
fi

# Build backend binary
echo "Building backend..."
cd "$DIR/backend" && go build -o "$DIR/backend/server" cmd/server/main.go

cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    fuser -k 18000/tcp 2>/dev/null
    fuser -k 18001/tcp 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

export NEXT_PUBLIC_API_URL=http://localhost:18001

echo "Starting Go backend on :18001..."
PORT=18001 "$DIR/backend/server" &
BACKEND_PID=$!
sleep 1

# Verify backend started
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ERROR: Backend failed to start!"
    exit 1
fi

echo "Starting Next.js frontend on :18000..."
cd "$DIR/frontend" && PORT=18000 node node_modules/.bin/next dev --hostname 0.0.0.0 &
FRONTEND_PID=$!
sleep 2

echo ""
echo "================================"
echo "  Frontend: http://0.0.0.0:18000"
echo "  Backend:  http://0.0.0.0:18001"
echo "================================"
echo ""
echo "Press Ctrl+C to stop all servers"

wait
