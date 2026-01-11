#!/bin/bash

# Wrapper script to run Electron companion app in development mode
# This is used by the native messaging host manifest when running from source

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ELECTRON_BIN="$SCRIPT_DIR/node_modules/.bin/electron"

# Check if electron is installed
if [ ! -f "$ELECTRON_BIN" ]; then
  echo "Error: Electron not found. Please run 'npm install' in $SCRIPT_DIR" >&2
  exit 1
fi

# Run electron with main.js
exec "$ELECTRON_BIN" "$SCRIPT_DIR/main.js" "$@"
