#!/bin/bash

# macOS Installation Script for Download Router Companion
# Platform: macOS ONLY
# Purpose: Installs native messaging host manifest for Chrome on macOS
# 
# This script is macOS-specific and uses macOS file system paths:
# - Manifest location: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
# - Requires bash shell (standard on macOS)
# - Handles .app bundle executable paths for built applications

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPANION_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_SOURCE="$COMPANION_DIR/manifests/com.downloadrouter.host.json"

# Determine executable path (from installed app, built app, or development)
EXECUTABLE_PATH=""

# Check if running from installed app bundle
INSTALLED_APP="/Applications/Download Router Companion.app/Contents/MacOS/Download Router Companion"
if [ -f "$INSTALLED_APP" ]; then
  EXECUTABLE_PATH="$INSTALLED_APP"
# Check if running from build directory
elif [ -f "$COMPANION_DIR/dist/mac/Download Router Companion.app/Contents/MacOS/Download Router Companion" ]; then
  EXECUTABLE_PATH="$COMPANION_DIR/dist/mac/Download Router Companion.app/Contents/MacOS/Download Router Companion"
# Check if running from unpacked build
elif [ -f "$COMPANION_DIR/dist/mac-arm64/Download Router Companion.app/Contents/MacOS/Download Router Companion" ]; then
  EXECUTABLE_PATH="$COMPANION_DIR/dist/mac-arm64/Download Router Companion.app/Contents/MacOS/Download Router Companion"
# Development mode - use wrapper script
elif [ -f "$COMPANION_DIR/node_modules/.bin/electron" ]; then
  EXECUTABLE_PATH="$COMPANION_DIR/run-companion.sh"
  if [ ! -f "$EXECUTABLE_PATH" ]; then
    echo "Error: Wrapper script not found at $EXECUTABLE_PATH"
    exit 1
  fi
else
  echo "Error: Could not find companion executable"
  echo ""
  echo "Please ensure the companion app is installed:"
  echo "  1. Download the DMG from GitHub releases"
  echo "  2. Install the app to /Applications/"
  echo "  3. Run this installer script again"
  echo ""
  echo "Or for development:"
  echo "  cd companion && npm install"
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

# Get extension ID (auto-detect, from file, or prompt user)
EXTENSION_ID=""

# First, try to auto-detect from Chrome
if [ -f "$COMPANION_DIR/install/detect-extension-id.sh" ]; then
  DETECTED_ID=$("$COMPANION_DIR/install/detect-extension-id.sh" 2>/dev/null)
  if [ -n "$DETECTED_ID" ] && [ ${#DETECTED_ID} -eq 32 ]; then
    EXTENSION_ID="$DETECTED_ID"
    echo ""
    echo "✓ Auto-detected extension ID: ${EXTENSION_ID:0:8}..."
  fi
fi

# Fallback to .extension-id file
if [ -z "$EXTENSION_ID" ] && [ -f "$COMPANION_DIR/.extension-id" ]; then
  EXTENSION_ID=$(cat "$COMPANION_DIR/.extension-id" | tr -d '\n\r ' | head -c 32)
  if [ -n "$EXTENSION_ID" ] && [ "$EXTENSION_ID" != "YOUR_EXTENSION_ID" ]; then
    echo ""
    echo "✓ Using extension ID from .extension-id file: ${EXTENSION_ID:0:8}..."
  else
    EXTENSION_ID=""
  fi
fi

# If still no extension ID, prompt user
if [ -z "$EXTENSION_ID" ] || [ "$EXTENSION_ID" = "YOUR_EXTENSION_ID" ]; then
  echo ""
  echo "=========================================="
  echo "Extension ID Required"
  echo "=========================================="
  echo ""
  echo "To connect the companion app to your Chrome extension, we need your extension ID."
  echo ""
  echo "How to find your Extension ID:"
  echo "1. Open Chrome and go to: chrome://extensions/"
  echo "2. Enable 'Developer mode' (toggle in top-right)"
  echo "3. Find 'Download Router' extension"
  echo "4. Copy the Extension ID (32-character string below the extension name)"
  echo ""
  echo "Note: If installing from Chrome Web Store, all users have the same extension ID."
  echo "      You can find it in the extension's Web Store page or chrome://extensions/"
  echo ""
  read -p "Enter your Extension ID (or press Enter to skip and edit manually later): " USER_EXT_ID
  
  if [ -n "$USER_EXT_ID" ]; then
    EXTENSION_ID=$(echo "$USER_EXT_ID" | tr -d '\n\r ' | head -c 32)
    # Save for future use (if we have write access)
    if [ -w "$COMPANION_DIR" ] || [ -w "$(dirname "$COMPANION_DIR")" ]; then
      echo "$EXTENSION_ID" > "$COMPANION_DIR/.extension-id" 2>/dev/null || true
      echo ""
      echo "✓ Extension ID saved"
    fi
  else
    EXTENSION_ID="YOUR_EXTENSION_ID"
    echo ""
    echo "⚠️  No extension ID provided. You'll need to edit the manifest manually."
    echo "   Location: $MANIFEST_DIR/com.downloadrouter.host.json"
  fi
  echo ""
fi

# Replace placeholders in manifest
TEMP_MANIFEST=$(mktemp)
sed -e "s|COMPANION_EXECUTABLE_PATH|$EXECUTABLE_PATH|g" \
    -e "s|YOUR_EXTENSION_ID|$EXTENSION_ID|g" \
    "$MANIFEST_SOURCE" > "$TEMP_MANIFEST"

# Copy manifest to Chrome directory
cp "$TEMP_MANIFEST" "$MANIFEST_DIR/com.downloadrouter.host.json"
rm "$TEMP_MANIFEST"

echo "✅ Native messaging host manifest installed successfully!"
echo "   Manifest location: $MANIFEST_DIR/com.downloadrouter.host.json"
echo ""

if [ "$EXTENSION_ID" != "YOUR_EXTENSION_ID" ]; then
  echo "✓ Extension ID configured: $EXTENSION_ID"
else
  echo "⚠️  Extension ID not configured. Please edit the manifest:"
  echo "   $MANIFEST_DIR/com.downloadrouter.host.json"
  echo "   Replace 'YOUR_EXTENSION_ID' with your actual extension ID"
fi

echo ""
echo "Next steps:"
echo "1. Restart Chrome completely (quit and relaunch)"
echo "2. Open extension options → Settings tab"
echo "3. Verify companion app status shows 'Installed'"
