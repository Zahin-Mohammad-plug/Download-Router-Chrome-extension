#!/bin/bash
# Direct Companion App Test - Tests folder picker and logging

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-companion-direct-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-companion-direct-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Direct Companion App Test ==="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
echo ""

cd "$REPO_ROOT"

echo "This test will:"
echo "  1. Start the companion app"
echo "  2. Test folder picker (you'll see a dialog)"
echo "  3. Test folder verification"
echo "  4. Check all logs"
echo ""

# Check if test-messaging.js exists and fix path if needed
TEST_SCRIPT="$REPO_ROOT/tests/test-messaging.js"
if [ ! -f "$TEST_SCRIPT" ]; then
    echo "❌ test-messaging.js not found at $TEST_SCRIPT"
    exit 1
fi

echo "✅ Test script found"
echo ""

# Check companion dependencies
cd "$REPO_ROOT/companion"
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing..."
    npm install
fi

if [ ! -f "node_modules/.bin/electron" ]; then
    echo "❌ Electron not found. Run: cd companion && npm install"
    exit 1
fi

echo "✅ Dependencies ready"
echo ""

echo "=== Starting Companion App Test ==="
echo ""
echo "⚠️  IMPORTANT: A folder picker dialog will open."
echo "    Please select a folder when prompted."
echo ""
echo "Starting test in 3 seconds..."
sleep 3

cd "$REPO_ROOT/companion"

# Run test-messaging.js which will test:
# 1. Version check
# 2. Folder verification  
# 3. Folder picker (user interaction required)
echo "Running test-messaging.js..."
echo ""

node ../tests/test-messaging.js 2>&1 | tee -a "$LOG_FILE"

TEST_RESULT=${PIPESTATUS[0]}

echo ""
echo "=== Test Complete ==="
echo ""

# Check for log files
echo "=== Checking Logs ==="
echo ""

COMPANION_MAIN_LOG="$LOG_DIR/companion-main-latest.log"
COMPANION_LOG="$LOG_DIR/companion-latest.log"

if [ -f "$COMPANION_MAIN_LOG" ]; then
    echo "✅ Companion main log found:"
    echo "   File: $COMPANION_MAIN_LOG"
    echo "   Size: $(wc -l < "$COMPANION_MAIN_LOG" 2>/dev/null || echo "0") lines"
    echo "   Last 10 lines:"
    tail -10 "$COMPANION_MAIN_LOG" | sed 's/^/     /'
    echo ""
else
    echo "⚠️  No companion-main log found yet"
    echo ""
fi

if [ -f "$COMPANION_LOG" ]; then
    echo "✅ Companion script log found:"
    echo "   File: $COMPANION_LOG"
    echo "   Size: $(wc -l < "$COMPANION_LOG" 2>/dev/null || echo "0") lines"
    echo "   Last 10 lines:"
    tail -10 "$COMPANION_LOG" | sed 's/^/     /'
    echo ""
else
    echo "⚠️  No companion script log found yet"
    echo ""
fi

echo "=== All Log Files ==="
ls -lth "$LOG_DIR"/*.log 2>/dev/null | head -10 || echo "No log files found"
echo ""

echo "=== Summary ==="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ Companion app test completed successfully!"
else
    echo "⚠️  Test completed with exit code: $TEST_RESULT"
    echo "   Check logs above for details"
fi

echo ""
echo "View all logs:"
echo "  cat logs/debug/companion-main-latest.log"
echo "  cat logs/debug/companion-latest.log"
echo "  cat logs/debug/test-companion-direct-latest.log"
echo ""

exit $TEST_RESULT
