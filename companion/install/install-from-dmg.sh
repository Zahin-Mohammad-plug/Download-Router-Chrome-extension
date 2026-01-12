#!/bin/bash
# Installer wrapper that works when run from DMG
# This script can be run directly from the DMG or copied out

echo "=========================================="
echo "Download Router Companion - Installer"
echo "=========================================="
echo ""

# Find the app bundle (could be in DMG or Applications)
APP_BUNDLE=""
if [ -d "/Volumes/Download Router Companion"* ]; then
    # Running from DMG
    DMG_MOUNT=$(ls -d /Volumes/Download\ Router\ Companion* 2>/dev/null | head -1)
    if [ -n "$DMG_MOUNT" ]; then
        APP_BUNDLE="$DMG_MOUNT/Download Router Companion.app"
    fi
elif [ -d "/Applications/Download Router Companion.app" ]; then
    # Already installed
    APP_BUNDLE="/Applications/Download Router Companion.app"
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
    echo "❌ Download Router Companion.app not found!"
    echo ""
    echo "Please either:"
    echo "  1. Mount the DMG and run this script from Terminal"
    echo "  2. Install the app to Applications first"
    exit 1
fi

echo "✓ Found app: $APP_BUNDLE"
echo ""

# Extract or access installer script
INSTALL_SCRIPT="$APP_BUNDLE/Contents/Resources/app/install/install-macos.sh"

if [ -f "$INSTALL_SCRIPT" ]; then
    echo "Running installer..."
    echo ""
    bash "$INSTALL_SCRIPT"
else
    echo "❌ Installer script not found in app bundle"
    echo "   Expected: $INSTALL_SCRIPT"
    echo ""
    echo "Please download the installer scripts from GitHub releases"
    exit 1
fi
