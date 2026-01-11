#!/bin/bash
# Development setup script for Download Router Companion

set -e

COMPANION_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=== Download Router Companion - Development Setup ==="
echo ""

# Check if extension ID is already set
if [ -f "$COMPANION_DIR/.extension-id" ]; then
  CURRENT_ID=$(cat "$COMPANION_DIR/.extension-id")
  echo "Current extension ID: $CURRENT_ID"
  echo ""
  read -p "Do you want to update it? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Using existing extension ID: $CURRENT_ID"
    EXTENSION_ID="$CURRENT_ID"
  else
    EXTENSION_ID=""
  fi
else
  EXTENSION_ID=""
fi

# Get extension ID if needed
if [ -z "$EXTENSION_ID" ]; then
  echo "To get your extension ID:"
  echo "1. Open Chrome and go to chrome://extensions/"
  echo "2. Enable 'Developer mode' (toggle in top right)"
  echo "3. Find 'Download Router' extension"
  echo "4. Copy the ID (long string under the extension name)"
  echo ""
  read -p "Enter your extension ID: " EXTENSION_ID
  
  if [ -z "$EXTENSION_ID" ]; then
    echo "Error: Extension ID cannot be empty"
    exit 1
  fi
  
  # Save extension ID
  echo "$EXTENSION_ID" > "$COMPANION_DIR/.extension-id"
  echo "Extension ID saved to .extension-id"
fi

echo ""
echo "Installing native messaging host manifest..."
bash "$COMPANION_DIR/install/install-macos.sh"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Restart Chrome completely (quit and reopen)"
echo "2. Open extension options page to verify companion app connection"
echo "3. To test the companion app, run: npm start"
