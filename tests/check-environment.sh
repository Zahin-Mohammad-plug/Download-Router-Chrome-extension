#!/bin/bash
# Environment Check Script for Download Router
# Checks all dependencies and configuration

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/environment-check.log"

echo "=== Download Router Environment Check ===" | tee "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
echo "User: $(whoami)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

ERRORS=0
WARNINGS=0

check_command() {
    local cmd=$1
    local name=$2
    if command -v "$cmd" >/dev/null 2>&1; then
        local version=$($cmd --version 2>&1 | head -1)
        echo "✅ $name: $version" | tee -a "$LOG_FILE"
        return 0
    else
        echo "❌ $name: NOT FOUND" | tee -a "$LOG_FILE"
        ((ERRORS++))
        return 1
    fi
}

check_directory() {
    local dir=$1
    local name=$2
    if [ -d "$dir" ]; then
        echo "✅ $name: $dir" | tee -a "$LOG_FILE"
        return 0
    else
        echo "❌ $name: NOT FOUND at $dir" | tee -a "$LOG_FILE"
        ((ERRORS++))
        return 1
    fi
}

check_file() {
    local file=$1
    local name=$2
    if [ -f "$file" ]; then
        echo "✅ $name: $file" | tee -a "$LOG_FILE"
        return 0
    else
        echo "❌ $name: NOT FOUND at $file" | tee -a "$LOG_FILE"
        ((WARNINGS++))
        return 1
    fi
}

echo "=== System Information ===" | tee -a "$LOG_FILE"
echo "OS: $(uname -s) $(uname -r)" | tee -a "$LOG_FILE"
echo "Shell: $SHELL" | tee -a "$LOG_FILE"
echo "Home: $HOME" | tee -a "$LOG_FILE"
echo "PWD: $(pwd)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "=== Required Commands ===" | tee -a "$LOG_FILE"
check_command "node" "Node.js"
check_command "npm" "npm"
check_command "python3" "Python 3"

echo "" | tee -a "$LOG_FILE"
echo "=== Node.js Environment ===" | tee -a "$LOG_FILE"
if command -v node >/dev/null 2>&1; then
    echo "Node path: $(which node)" | tee -a "$LOG_FILE"
    echo "npm path: $(which npm)" | tee -a "$LOG_FILE"
    echo "NODE_PATH: ${NODE_PATH:-not set}" | tee -a "$LOG_FILE"
fi
echo "" | tee -a "$LOG_FILE"

echo "=== Project Structure ===" | tee -a "$LOG_FILE"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
check_directory "$REPO_ROOT/extension" "Extension directory"
check_directory "$REPO_ROOT/companion" "Companion directory"
check_directory "$REPO_ROOT/tests" "Tests directory"
check_directory "$REPO_ROOT/docs" "Docs directory"

echo "" | tee -a "$LOG_FILE"
echo "=== Extension Files ===" | tee -a "$LOG_FILE"
check_file "$REPO_ROOT/extension/manifest.json" "manifest.json"
check_file "$REPO_ROOT/extension/background.js" "background.js"
check_file "$REPO_ROOT/extension/content.js" "content.js"
check_file "$REPO_ROOT/extension/lib/native-messaging-client.js" "native-messaging-client.js"

echo "" | tee -a "$LOG_FILE"
echo "=== Companion App Files ===" | tee -a "$LOG_FILE"
check_file "$REPO_ROOT/companion/main.js" "main.js"
check_file "$REPO_ROOT/companion/package.json" "package.json"
check_file "$REPO_ROOT/companion/run-companion.sh" "run-companion.sh"

echo "" | tee -a "$LOG_FILE"
echo "=== Companion Dependencies ===" | tee -a "$LOG_FILE"
if [ -d "$REPO_ROOT/companion/node_modules" ]; then
    echo "✅ node_modules exists" | tee -a "$LOG_FILE"
    if [ -f "$REPO_ROOT/companion/node_modules/.bin/electron" ]; then
        ELECTRON_VERSION=$("$REPO_ROOT/companion/node_modules/.bin/electron" --version 2>&1)
        echo "✅ Electron: $ELECTRON_VERSION" | tee -a "$LOG_FILE"
    else
        echo "⚠️  Electron not found in node_modules" | tee -a "$LOG_FILE"
        echo "   Run: cd companion && npm install" | tee -a "$LOG_FILE"
        ((WARNINGS++))
    fi
else
    echo "❌ node_modules not found" | tee -a "$LOG_FILE"
    echo "   Run: cd companion && npm install" | tee -a "$LOG_FILE"
    ((ERRORS++))
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Chrome/Extension Setup ===" | tee -a "$LOG_FILE"
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
CHROME_MANIFEST="$CHROME_MANIFEST_DIR/com.downloadrouter.host.json"
if [ -f "$CHROME_MANIFEST" ]; then
    echo "✅ Native messaging manifest exists" | tee -a "$LOG_FILE"
    echo "   Location: $CHROME_MANIFEST" | tee -a "$LOG_FILE"
    # Check if it has valid JSON
    if python3 -m json.tool "$CHROME_MANIFEST" >/dev/null 2>&1; then
        echo "✅ Manifest JSON is valid" | tee -a "$LOG_FILE"
        # Extract path and extension ID
        SCRIPT_PATH=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['path'])" "$CHROME_MANIFEST" 2>/dev/null)
        EXT_ID=$(python3 -c "import json, sys; origins=json.load(open(sys.argv[1]))['allowed_origins']; print(origins[0].split('://')[1].split('/')[0] if origins else 'not set')" "$CHROME_MANIFEST" 2>/dev/null)
        echo "   Script path: $SCRIPT_PATH" | tee -a "$LOG_FILE"
        echo "   Extension ID: $EXT_ID" | tee -a "$LOG_FILE"
        if [ -f "$SCRIPT_PATH" ]; then
            echo "✅ Script path is valid" | tee -a "$LOG_FILE"
        else
            echo "❌ Script path does not exist: $SCRIPT_PATH" | tee -a "$LOG_FILE"
            ((ERRORS++))
        fi
    else
        echo "❌ Manifest JSON is invalid" | tee -a "$LOG_FILE"
        ((ERRORS++))
    fi
else
    echo "⚠️  Native messaging manifest not found" | tee -a "$LOG_FILE"
    echo "   Location: $CHROME_MANIFEST" | tee -a "$LOG_FILE"
    echo "   Install with: cd companion && bash install/install-macos.sh" | tee -a "$LOG_FILE"
    ((WARNINGS++))
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Logging Setup ===" | tee -a "$LOG_FILE"
echo "Log directory: $LOG_DIR" | tee -a "$LOG_FILE"
if [ -d "$LOG_DIR" ] && [ -w "$LOG_DIR" ]; then
    echo "✅ Log directory exists and is writable" | tee -a "$LOG_FILE"
else
    echo "❌ Log directory not accessible" | tee -a "$LOG_FILE"
    ((ERRORS++))
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Permissions ===" | tee -a "$LOG_FILE"
if [ -x "$REPO_ROOT/companion/run-companion.sh" ]; then
    echo "✅ run-companion.sh is executable" | tee -a "$LOG_FILE"
else
    echo "⚠️  run-companion.sh is not executable" | tee -a "$LOG_FILE"
    echo "   Fix with: chmod +x $REPO_ROOT/companion/run-companion.sh" | tee -a "$LOG_FILE"
    ((WARNINGS++))
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Summary ===" | tee -a "$LOG_FILE"
echo "Errors: $ERRORS" | tee -a "$LOG_FILE"
echo "Warnings: $WARNINGS" | tee -a "$LOG_FILE"
if [ $ERRORS -eq 0 ]; then
    echo "✅ Environment check passed!" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    echo "Full log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
    exit 0
else
    echo "❌ Environment check failed with $ERRORS error(s)" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    echo "Full log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
    exit 1
fi
