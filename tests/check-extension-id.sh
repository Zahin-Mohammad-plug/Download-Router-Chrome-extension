#!/bin/bash
# Script to check and fix extension ID mismatch

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"

echo "=== Extension ID Checker ==="
echo ""

CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json"

if [ ! -f "$CHROME_MANIFEST" ]; then
    echo "❌ Native messaging manifest not found!"
    echo "   Location: $CHROME_MANIFEST"
    echo ""
    echo "Install it first:"
    echo "  cd companion && bash install/install-macos.sh"
    exit 1
fi

echo "✅ Manifest found: $CHROME_MANIFEST"
echo ""

# Get extension ID from manifest
if command -v python3 >/dev/null 2>&1; then
    EXT_ID_IN_MANIFEST=$(python3 -c "
import json, sys
try:
    manifest = json.load(open(sys.argv[1]))
    origins = manifest.get('allowed_origins', [])
    if origins:
        ext_id = origins[0].split('://')[1].split('/')[0]
        print(ext_id)
    else:
        print('NONE')
except Exception as e:
    print(f'ERROR: {e}')
" "$CHROME_MANIFEST")
    
    echo "Extension ID in manifest: $EXT_ID_IN_MANIFEST"
    echo ""
    
    if [ "$EXT_ID_IN_MANIFEST" = "YOUR_EXTENSION_ID" ] || [ -z "$EXT_ID_IN_MANIFEST" ] || [ "$EXT_ID_IN_MANIFEST" = "NONE" ]; then
        echo "❌ Extension ID is not set or is a placeholder!"
        echo ""
        echo "To fix:"
        echo "1. Open Chrome → chrome://extensions/"
        echo "2. Find 'Download Router' extension"
        echo "3. Copy the extension ID (shown below extension name)"
        echo "4. Run: cd companion && echo 'YOUR_EXTENSION_ID_HERE' > .extension-id"
        echo "5. Run: cd companion && bash install/install-macos.sh"
        echo "6. Restart Chrome completely"
        exit 1
    fi
    
    echo "✅ Extension ID is set: $EXT_ID_IN_MANIFEST"
    echo ""
    echo "=== Next Steps ==="
    echo ""
    echo "1. Open Chrome → chrome://extensions/"
    echo "2. Find 'Download Router' extension"
    echo "3. Check if the Extension ID matches: $EXT_ID_IN_MANIFEST"
    echo ""
    echo "If they DON'T match:"
    echo "  - Get the actual extension ID from chrome://extensions/"
    echo "  - Update: cd companion && echo 'ACTUAL_ID' > .extension-id"
    echo "  - Reinstall: cd companion && bash install/install-macos.sh"
    echo "  - Restart Chrome completely"
    echo ""
    echo "If they DO match:"
    echo "  - Make sure Chrome was restarted after installing manifest"
    echo "  - Try reloading the extension"
    echo "  - Check logs: cat logs/debug/companion-latest.log"
    
else
    echo "❌ Python3 not found - cannot parse manifest"
    exit 1
fi
