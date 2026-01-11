#!/bin/bash

# Wrapper script to run Electron companion app in development mode
# This is used by the native messaging host manifest when running from source

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_FILE="$SCRIPT_DIR/logs/companion.log"

mkdir -p "$(dirname "$LOG_FILE")"
echo "=== Companion Script Started ===" >> "$LOG_FILE"
echo "Timestamp: $(date)" >> "$LOG_FILE"
echo "User: $(whoami)" >> "$LOG_FILE"
echo "Initial PATH: $PATH" >> "$LOG_FILE"
echo "PWD: $(pwd)" >> "$LOG_FILE"
echo "Script location: $0" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Script directory: $SCRIPT_DIR" >> "$LOG_FILE"

# Add common Node.js paths to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "Updated PATH: $PATH" >> "$LOG_FILE"

# Find node executable
NODE_BIN=$(which node 2>/dev/null)
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found in PATH" >> "$LOG_FILE"
  echo "Error: Node.js not found in PATH" >&2
  exit 1
fi
echo "Node binary: $NODE_BIN" >> "$LOG_FILE"

# Check if electron exists
ELECTRON_CLI="$SCRIPT_DIR/node_modules/.bin/electron"
if [ ! -f "$ELECTRON_CLI" ]; then
  echo "ERROR: Electron not found at $ELECTRON_CLI" >> "$LOG_FILE"
  echo "Error: Electron not found. Please run 'npm install' in $SCRIPT_DIR" >&2
  exit 1
fi
echo "Electron CLI: $ELECTRON_CLI" >> "$LOG_FILE"

# Check if main.js exists
MAIN_JS="$SCRIPT_DIR/main.js"
if [ ! -f "$MAIN_JS" ]; then
  echo "ERROR: main.js not found at $MAIN_JS" >> "$LOG_FILE"
  echo "Error: main.js not found" >&2
  exit 1
fi
echo "Main JS: $MAIN_JS" >> "$LOG_FILE"

echo "Launching Electron..." >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Run electron via node, redirect stderr to log
exec "$NODE_BIN" "$ELECTRON_CLI" "$MAIN_JS" "$@" 2>> "$LOG_FILE"
