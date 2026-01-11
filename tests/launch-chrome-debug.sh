#!/bin/bash

# Script to launch Chrome with remote debugging enabled on a specific profile
# Usage: ./launch-chrome-debug.sh [profile-name]

# Default profile (you can change this)
PROFILE="${1:-Default}"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Check if Chrome exists
if [ ! -f "$CHROME_PATH" ]; then
    echo "Error: Chrome not found at $CHROME_PATH"
    exit 1
fi

# Kill any existing Chrome instances with remote debugging on port 9222
lsof -ti:9222 | xargs kill -9 2>/dev/null || true

echo "Launching Chrome with remote debugging on port 9222..."
echo "Profile: $PROFILE"
echo ""
echo "To connect MCP server, use: --browser-url=http://127.0.0.1:9222"
echo ""

# Launch Chrome with remote debugging
exec "$CHROME_PATH" \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/Library/Application Support/Google/Chrome" \
    --profile-directory="$PROFILE" \
    > /dev/null 2>&1 &

CHROME_PID=$!
echo "Chrome launched with PID: $CHROME_PID"
echo "Remote debugging available at: http://127.0.0.1:9222"
echo ""
echo "To verify, visit: http://127.0.0.1:9222/json"
