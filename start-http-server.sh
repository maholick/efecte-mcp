#!/bin/bash

# Start the Efecte MCP HTTP Server
# This script sets HTTP transport environment variables and starts the server
# Note: The .env file is loaded by the Node.js application using dotenv

set -e  # Exit on error

cd "$(dirname "$0")"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: dist directory not found. Please run 'npm run build' first." >&2
    exit 1
fi

# Check if start-http.js exists
if [ ! -f "dist/start-http.js" ]; then
    echo "Error: dist/start-http.js not found. Please run 'npm run build' first." >&2
    exit 1
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: node command not found. Please install Node.js." >&2
    exit 1
fi

# Override transport settings for HTTP mode
export EFECTE_TRANSPORT_DEFAULT=http
export EFECTE_TRANSPORT_HTTP_ENABLED=true
export EFECTE_TRANSPORT_HTTP_HOST="${EFECTE_TRANSPORT_HTTP_HOST:-0.0.0.0}"

# Get port from environment or use default
PORT="${EFECTE_TRANSPORT_HTTP_PORT:-3000}"

# Determine display URL (use localhost for 0.0.0.0)
DISPLAY_HOST="${EFECTE_TRANSPORT_HTTP_HOST}"
if [ "$DISPLAY_HOST" = "0.0.0.0" ]; then
    DISPLAY_HOST="localhost"
fi

# Start the server
echo "Starting Efecte MCP HTTP Server..."
echo "Transport: Streamable HTTP"
echo "Host: ${EFECTE_TRANSPORT_HTTP_HOST}"
echo "Port: ${PORT}"
echo "Server will be available at: http://${DISPLAY_HOST}:${PORT}"
echo ""

# Run the server (dotenv in start-http.ts will load .env file)
exec node dist/start-http.js