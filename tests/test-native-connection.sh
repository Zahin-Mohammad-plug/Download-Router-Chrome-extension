#!/bin/bash
# Test script to verify native messaging connection

echo "Testing native messaging connection..."
echo ""

# Test if manifest exists
MANIFEST_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json"
if [ ! -f "$MANIFEST_PATH" ]; then
    echo "❌ Manifest not found at: $MANIFEST_PATH"
    exit 1
fi
echo "✅ Manifest found"

# Check manifest content
HOST_NAME=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['name'])" "$MANIFEST_PATH" 2>/dev/null)
SCRIPT_PATH=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['path'])" "$MANIFEST_PATH" 2>/dev/null)

echo "✅ Host name: $HOST_NAME"
echo "✅ Script path: $SCRIPT_PATH"

# Check if script exists and is executable
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Script not found: $SCRIPT_PATH"
    exit 1
fi
echo "✅ Script exists"

if [ ! -x "$SCRIPT_PATH" ]; then
    echo "❌ Script not executable: $SCRIPT_PATH"
    exit 1
fi
echo "✅ Script is executable"

echo ""
echo "All checks passed! ✅"
