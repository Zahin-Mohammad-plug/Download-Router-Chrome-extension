#!/bin/bash

# macOS Installation Script for Download Router Companion
# Installs native messaging host manifest for Chrome

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPANION_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_SOURCE="$COMPANION_DIR/manifests/com.downloadrouter.host.json"

# Determine executable path (from built app or development)
if [ -f "$COMPANION_DIR/dist/mac/Download Router Companion.app/Contents/MacOS/Download Router Companion" ]; then
  EXECUTABLE_PATH="$COMPANION_DIR/dist/mac/Download Router Companion.app/Contents/MacOS/Download Router Companion"
elif [ -f "$COMPANION_DIR/node_modules/.bin/electron" ]; then
  # Development mode - use wrapper script that runs electron with main.js
  EXECUTABLE_PATH="$COMPANION_DIR/run-companion.sh"
  if [ ! -f "$EXECUTABLE_PATH" ]; then
    echo "Error: Wrapper script not found at $EXECUTABLE_PATH"
    exit 1
  fi
else
  echo "Error: Could not find companion executable"
  echo "Please run 'npm install' in the companion directory first"
  exit 1
fi

# Native messaging hosts directory
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Create directory if it doesn't exist
mkdir -p "$MANIFEST_DIR"

# Read manifest template
if [ ! -f "$MANIFEST_SOURCE" ]; then
  echo "Error: Manifest template not found at $MANIFEST_SOURCE"
  exit 1
fi

# Replace placeholders in manifest
# Note: Extension ID should be replaced with actual extension ID
TEMP_MANIFEST=$(mktemp)
sed -e "s|COMPANION_EXECUTABLE_PATH|$EXECUTABLE_PATH|g" \
    -e "s|YOUR_EXTENSION_ID|$(cat "$COMPANION_DIR/.extension-id" 2>/dev/null || echo "YOUR_EXTENSION_ID")|g" \
    "$MANIFEST_SOURCE" > "$TEMP_MANIFEST"

# Copy manifest to Chrome directory
cp "$TEMP_MANIFEST" "$MANIFEST_DIR/com.downloadrouter.host.json"
rm "$TEMP_MANIFEST"

echo "Native messaging host manifest installed successfully!"
echo "Manifest location: $MANIFEST_DIR/com.downloadrouter.host.json"
echo ""
echo "Next steps:"
echo "1. Update the extension ID in the manifest if needed"
echo "2. Restart Chrome"
echo "3. Open the extension options to verify companion app connection"
