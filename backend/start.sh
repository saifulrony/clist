#!/bin/bash
cd "$(dirname "$0")"
kill $(lsof -ti:18001) 2>/dev/null
sleep 1
go build -o server ./cmd/server/
PORT=18001 nohup ./server >> /tmp/server.log 2>&1 &
echo "Server started on port 18001 (PID: $!)"
