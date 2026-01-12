#!/bin/bash
# Test Companion App Installation

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-companion-install-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-companion-install-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Companion App Installation Test ==="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
echo ""

cd "$REPO_ROOT"

ERRORS=0

echo "=== Step 1: Check Installation Script ==="
INSTALL_SCRIPT="$REPO_ROOT/companion/install/install-macos.sh"
if [ -f "$INSTALL_SCRIPT" ]; then
    echo "✅ Installation script exists: $INSTALL_SCRIPT"
    if [ -x "$INSTALL_SCRIPT" ]; then
        echo "✅ Installation script is executable"
    else
        echo "⚠️  Installation script is not executable (will be run with bash)"
    fi
else
    echo "❌ Installation script not found"
    ((ERRORS++))
fi
echo ""

echo "=== Step 2: Check Manifest Template ==="
MANIFEST_TEMPLATE="$REPO_ROOT/companion/manifests/com.downloadrouter.host.json"
if [ -f "$MANIFEST_TEMPLATE" ]; then
    echo "✅ Manifest template exists: $MANIFEST_TEMPLATE"
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$MANIFEST_TEMPLATE" >/dev/null 2>&1; then
            echo "✅ Manifest template JSON is valid"
            # Check placeholders
            if grep -q "COMPANION_EXECUTABLE_PATH" "$MANIFEST_TEMPLATE"; then
                echo "✅ Contains COMPANION_EXECUTABLE_PATH placeholder"
            else
                echo "⚠️  Missing COMPANION_EXECUTABLE_PATH placeholder"
            fi
            if grep -q "YOUR_EXTENSION_ID" "$MANIFEST_TEMPLATE"; then
                echo "✅ Contains YOUR_EXTENSION_ID placeholder"
            else
                echo "⚠️  Missing YOUR_EXTENSION_ID placeholder"
            fi
        else
            echo "❌ Manifest template JSON is invalid"
            ((ERRORS++))
        fi
    fi
else
    echo "❌ Manifest template not found"
    ((ERRORS++))
fi
echo ""

echo "=== Step 3: Check Installed Manifest ==="
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
CHROME_MANIFEST="$CHROME_MANIFEST_DIR/com.downloadrouter.host.json"

if [ -f "$CHROME_MANIFEST" ]; then
    echo "✅ Installed manifest exists: $CHROME_MANIFEST"
    
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$CHROME_MANIFEST" >/dev/null 2>&1; then
            echo "✅ Installed manifest JSON is valid"
            
            # Extract values
            SCRIPT_PATH=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['path'])" "$CHROME_MANIFEST" 2>/dev/null)
            EXT_ORIGINS=$(python3 -c "import json, sys; origins=json.load(open(sys.argv[1]))['allowed_origins']; print('\\n'.join(origins))" "$CHROME_MANIFEST" 2>/dev/null)
            
            echo "   Script path: $SCRIPT_PATH"
            echo "   Allowed origins:"
            echo "$EXT_ORIGINS" | sed 's/^/     /'
            
            # Verify script path
            if [ -f "$SCRIPT_PATH" ]; then
                echo "✅ Script path exists"
                if [ -x "$SCRIPT_PATH" ]; then
                    echo "✅ Script is executable"
                else
                    echo "❌ Script is not executable"
                    ((ERRORS++))
                fi
            else
                echo "❌ Script path does not exist: $SCRIPT_PATH"
                ((ERRORS++))
            fi
            
            # Check if extension ID is set (not placeholder)
            if echo "$EXT_ORIGINS" | grep -q "YOUR_EXTENSION_ID"; then
                echo "⚠️  WARNING: Extension ID still contains placeholder!"
                echo "   Update .extension-id file and reinstall"
            else
                EXT_ID=$(echo "$EXT_ORIGINS" | sed -n 's|chrome-extension://\([^/]*\)/.*|\1|p' | head -1)
                if [ -n "$EXT_ID" ]; then
                    echo "✅ Extension ID is set: $EXT_ID"
                fi
            fi
        else
            echo "❌ Installed manifest JSON is invalid"
            ((ERRORS++))
        fi
    fi
else
    echo "⚠️  Installed manifest not found"
    echo "   Location: $CHROME_MANIFEST"
    echo "   Run installation script to create it"
fi
echo ""

echo "=== Step 4: Check run-companion.sh ==="
RUN_SCRIPT="$REPO_ROOT/companion/run-companion.sh"
if [ -f "$RUN_SCRIPT" ]; then
    echo "✅ run-companion.sh exists"
    if [ -x "$RUN_SCRIPT" ]; then
        echo "✅ run-companion.sh is executable"
        
        # Check if it references the correct log directory
        if grep -q "logs/debug" "$RUN_SCRIPT"; then
            echo "✅ Uses logs/debug directory for logging"
        else
            echo "⚠️  May not be using logs/debug directory"
        fi
    else
        echo "❌ run-companion.sh is not executable"
        chmod +x "$RUN_SCRIPT"
        echo "   Fixed permissions"
    fi
else
    echo "❌ run-companion.sh not found"
    ((ERRORS++))
fi
echo ""

echo "=== Step 5: Test Dependencies ==="
if [ -d "$REPO_ROOT/companion/node_modules" ]; then
    echo "✅ node_modules exists"
    if [ -f "$REPO_ROOT/companion/node_modules/.bin/electron" ]; then
        ELECTRON_VERSION=$("$REPO_ROOT/companion/node_modules/.bin/electron" --version 2>&1)
        echo "✅ Electron found: $ELECTRON_VERSION"
    else
        echo "❌ Electron not found in node_modules"
        echo "   Run: cd companion && npm install"
        ((ERRORS++))
    fi
else
    echo "❌ node_modules not found"
    echo "   Run: cd companion && npm install"
    ((ERRORS++))
fi
echo ""

echo "=== Summary ==="
if [ $ERRORS -eq 0 ]; then
    echo "✅ Installation test passed!"
    echo ""
    echo "Companion app is properly installed and configured."
    echo "Log saved to: $LOG_FILE"
    exit 0
else
    echo "❌ Installation test failed with $ERRORS error(s)"
    echo ""
    echo "Log saved to: $LOG_FILE"
    exit 1
fi
