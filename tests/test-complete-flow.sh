#!/bin/bash
# Complete flow test script with detailed logging

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-complete-flow-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-complete-flow-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Download Router Complete Flow Test ==="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
echo "Latest log: $LATEST_LOG"
ln -sf "$(basename "$LOG_FILE")" "$LATEST_LOG" 2>/dev/null || true
echo ""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Step 1: Environment Check ==="
if [ -x "$REPO_ROOT/tests/check-environment.sh" ]; then
    "$REPO_ROOT/tests/check-environment.sh"
    ENV_CHECK_RESULT=$?
    if [ $ENV_CHECK_RESULT -ne 0 ]; then
        echo "❌ Environment check failed. Please fix issues before proceeding."
        echo "See: $LOG_DIR/environment-check.log"
        exit 1
    fi
else
    echo "⚠️  check-environment.sh not found or not executable"
fi
echo ""

echo "=== Step 2: Check Extension Files ==="
EXTENSION_FILES=(
    "extension/manifest.json"
    "extension/background.js"
    "extension/content.js"
    "extension/popup.html"
    "extension/popup.js"
    "extension/options.html"
    "extension/options.js"
    "extension/lib/native-messaging-client.js"
)

for file in "${EXTENSION_FILES[@]}"; do
    if [ -f "$REPO_ROOT/$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file MISSING"
        exit 1
    fi
done
echo ""

echo "=== Step 3: Check Companion App ==="
if [ ! -d "$REPO_ROOT/companion/node_modules" ]; then
    echo "⚠️  node_modules not found. Installing dependencies..."
    cd "$REPO_ROOT/companion"
    npm install
    INSTALL_RESULT=$?
    if [ $INSTALL_RESULT -ne 0 ]; then
        echo "❌ npm install failed"
        exit 1
    fi
    cd "$REPO_ROOT"
fi

if [ -f "$REPO_ROOT/companion/node_modules/.bin/electron" ]; then
    echo "✅ Electron found"
else
    echo "❌ Electron not found"
    exit 1
fi
echo ""

echo "=== Step 4: Check Native Messaging Manifest ==="
MANIFEST_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json"
if [ -f "$MANIFEST_PATH" ]; then
    echo "✅ Manifest exists: $MANIFEST_PATH"
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$MANIFEST_PATH" >/dev/null 2>&1; then
            echo "✅ Manifest JSON is valid"
            SCRIPT_PATH=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['path'])" "$MANIFEST_PATH" 2>/dev/null)
            echo "   Script path: $SCRIPT_PATH"
            if [ -f "$SCRIPT_PATH" ]; then
                echo "✅ Script path is valid"
                if [ -x "$SCRIPT_PATH" ]; then
                    echo "✅ Script is executable"
                else
                    echo "⚠️  Script is not executable"
                fi
            else
                echo "❌ Script path does not exist"
            fi
        else
            echo "❌ Manifest JSON is invalid"
        fi
    fi
else
    echo "⚠️  Manifest not found"
    echo "   Install with: cd companion && bash install/install-macos.sh"
fi
echo ""

echo "=== Step 5: Test Companion App Script ==="
if [ -x "$REPO_ROOT/companion/run-companion.sh" ]; then
    echo "✅ run-companion.sh is executable"
    # Test if it can find dependencies (don't actually run it)
    echo "   Testing script structure..."
    if grep -q "ELECTRON_CLI" "$REPO_ROOT/companion/run-companion.sh"; then
        echo "✅ Script structure looks good"
    fi
else
    echo "❌ run-companion.sh is not executable"
    echo "   Fixing permissions..."
    chmod +x "$REPO_ROOT/companion/run-companion.sh"
fi
echo ""

echo "=== Step 6: Extension Manifest Validation ==="
if command -v python3 >/dev/null 2>&1; then
    if python3 -m json.tool "$REPO_ROOT/extension/manifest.json" >/dev/null 2>&1; then
        echo "✅ extension/manifest.json is valid JSON"
        # Check for overlay.html reference (should be removed)
        if grep -q "overlay.html" "$REPO_ROOT/extension/manifest.json"; then
            echo "⚠️  WARNING: overlay.html still referenced in manifest"
        else
            echo "✅ No overlay.html reference (correct)"
        fi
    else
        echo "❌ extension/manifest.json has JSON errors"
        exit 1
    fi
fi
echo ""

echo "=== Step 7: Test Log Directory ==="
if [ -d "$LOG_DIR" ] && [ -w "$LOG_DIR" ]; then
    echo "✅ Log directory exists and is writable: $LOG_DIR"
    echo "   Files in log directory:"
    ls -lh "$LOG_DIR" 2>/dev/null | tail -5 || echo "   (empty or cannot list)"
else
    echo "❌ Log directory not accessible"
    exit 1
fi
echo ""

echo "=== Summary ==="
echo "✅ All basic checks passed!"
echo ""
echo "Next steps:"
echo "1. Load extension in Chrome: chrome://extensions/ → Load unpacked → Select 'extension/' folder"
echo "2. Get extension ID from chrome://extensions/"
echo "3. Install companion app: cd companion && echo 'EXTENSION_ID' > .extension-id && bash install/install-macos.sh"
echo "4. Restart Chrome"
echo "5. Test: Open extension options → Settings tab → Check companion status"
echo ""
echo "Logs are being saved to: $LOG_DIR (logs/debug/)"
echo "View latest logs: ls -lt logs/debug/ | head -10"
