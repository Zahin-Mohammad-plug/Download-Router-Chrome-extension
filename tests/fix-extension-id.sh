#!/bin/bash
# Fix Extension ID Mismatch - Updates manifest with correct extension ID

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"

echo "=== Fix Extension ID Mismatch ==="
echo ""
echo "This script will help you fix the 'Access forbidden' error."
echo ""

CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json"

if [ ! -f "$CHROME_MANIFEST" ]; then
    echo "❌ Native messaging manifest not found!"
    echo "   Install it first: cd companion && bash install/install-macos.sh"
    exit 1
fi

# Get current extension ID from manifest
if command -v python3 >/dev/null 2>&1; then
    CURRENT_EXT_ID=$(python3 -c "
import json, sys
try:
    manifest = json.load(open(sys.argv[1]))
    origins = manifest.get('allowed_origins', [])
    if origins:
        ext_id = origins[0].split('://')[1].split('/')[0]
        print(ext_id)
    else:
        print('')
except:
    print('')
" "$CHROME_MANIFEST")
    
    echo "Current extension ID in manifest: ${CURRENT_EXT_ID:-'NOT SET'}"
    echo ""
fi

echo "Steps to fix:"
echo ""
echo "1. Open Chrome → chrome://extensions/"
echo "2. Enable 'Developer mode' (top right)"
echo "3. Find 'Download Router' extension"
echo "4. Copy the Extension ID (32-character string below extension name)"
echo ""
read -p "Paste your Extension ID here: " NEW_EXT_ID

# Validate extension ID format (should be 32 alphanumeric characters)
if [ -z "$NEW_EXT_ID" ]; then
    echo "❌ Extension ID cannot be empty"
    exit 1
fi

if ! echo "$NEW_EXT_ID" | grep -qE '^[a-z]{32}$'; then
    echo "⚠️  Warning: Extension ID doesn't look right (should be 32 lowercase letters)"
    echo "   Continuing anyway..."
fi

echo ""
echo "Updating manifest with extension ID: $NEW_EXT_ID"
echo ""

# Update the manifest
if command -v python3 >/dev/null 2>&1; then
    python3 << EOF
import json
import sys

manifest_path = "$CHROME_MANIFEST"
new_ext_id = "$NEW_EXT_ID"

try:
    # Read current manifest
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    
    # Update allowed_origins
    manifest['allowed_origins'] = [f'chrome-extension://{new_ext_id}/']
    
    # Write back
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=4)
    
    print("✅ Manifest updated successfully!")
    print(f"   New extension ID: {new_ext_id}")
    print(f"   Manifest location: {manifest_path}")
    
except Exception as e:
    print(f"❌ Error updating manifest: {e}")
    sys.exit(1)
EOF
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Extension ID updated in manifest!"
        echo ""
        echo "=== IMPORTANT: Restart Chrome ==="
        echo ""
        echo "You MUST restart Chrome completely for this to take effect:"
        echo "  1. Quit Chrome completely (Cmd+Q or Chrome → Quit)"
        echo "  2. Relaunch Chrome"
        echo "  3. Reload the extension in chrome://extensions/"
        echo "  4. Try using the extension again"
        echo ""
        echo "Also save this extension ID for future reference:"
        echo "  cd companion && echo '$NEW_EXT_ID' > .extension-id"
        echo ""
    else
        echo "❌ Failed to update manifest"
        exit 1
    fi
else
    echo "❌ Python3 not found - cannot update manifest automatically"
    echo ""
    echo "Manual fix:"
    echo "1. Edit: $CHROME_MANIFEST"
    echo "2. Change 'allowed_origins' to: [\"chrome-extension://$NEW_EXT_ID/\"]"
    echo "3. Restart Chrome"
    exit 1
fi
