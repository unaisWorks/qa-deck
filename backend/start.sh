#!/bin/bash
# QA Deck Backend — Start Script

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║     QA Deck Backend v1.0     ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# Check Node version
NODE_VERSION=$(node --version 2>/dev/null)
if [ -z "$NODE_VERSION" ]; then
  echo "  ✗ Node.js not found. Install from https://nodejs.org"
  exit 1
fi
echo "  ✓ Node.js $NODE_VERSION"

# Check port availability
PORT=${PORT:-3747}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  ✗ Port $PORT is already in use."
  echo "    Set a different port: PORT=3748 ./start.sh"
  exit 1
fi
echo "  ✓ Port $PORT is available"

# Start server
echo "  → Starting server on http://localhost:$PORT"
echo ""
node server.js
