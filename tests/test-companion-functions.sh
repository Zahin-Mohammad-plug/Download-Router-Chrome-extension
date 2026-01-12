#!/bin/bash
# Test Companion App Functionality
# Tests: folder picker, folder operations, file moving

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-companion-functions-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-companion-functions-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Companion App Functionality Test ==="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
echo ""

cd "$REPO_ROOT"

echo "This test requires the companion app to be running."
echo "We'll use test-messaging.js to test functionality via native messaging protocol."
echo ""

echo "=== Step 1: Check Test Script ==="
TEST_SCRIPT="$REPO_ROOT/tests/test-messaging.js"
if [ -f "$TEST_SCRIPT" ]; then
    echo "✅ test-messaging.js found"
else
    echo "❌ test-messaging.js not found"
    exit 1
fi

echo ""
echo "=== Step 2: Run Functionality Tests ==="
echo "Starting companion app and running tests..."
echo "This will test:"
echo "  1. Version check (getVersion)"
echo "  2. Folder verification (verifyFolder)"
echo "  3. Folder picker (pickFolder) - requires user interaction"
echo ""
echo "Note: Folder picker test will open a dialog - you'll need to select a folder"
echo ""

cd "$REPO_ROOT/companion"
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Run: npm install"
    exit 1
fi

echo "Running test-messaging.js..."
echo ""

# Run the test script
node ../tests/test-messaging.js 2>&1 | tee -a "$LOG_FILE"

TEST_RESULT=${PIPESTATUS[0]}

echo ""
echo "=== Test Results ==="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ Functionality tests passed!"
else
    echo "❌ Functionality tests failed or incomplete"
fi
echo ""
echo "Check the output above for detailed test results."
echo "Log saved to: $LOG_FILE"
