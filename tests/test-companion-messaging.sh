#!/bin/bash
# Test Native Messaging Connection

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-companion-messaging-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-companion-messaging-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Native Messaging Connection Test ==="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
echo ""

cd "$REPO_ROOT"

echo "=== Step 1: Run test-native-connection.sh ==="
if [ -f "$REPO_ROOT/tests/test-native-connection.sh" ]; then
    echo "Running test-native-connection.sh..."
    echo ""
    bash "$REPO_ROOT/tests/test-native-connection.sh"
    CONNECTION_TEST_RESULT=$?
    echo ""
    if [ $CONNECTION_TEST_RESULT -eq 0 ]; then
        echo "✅ Native connection test passed"
    else
        echo "❌ Native connection test failed"
    fi
else
    echo "⚠️  test-native-connection.sh not found"
fi
echo ""

echo "=== Step 2: Test Companion App Startup ==="
RUN_SCRIPT="$REPO_ROOT/companion/run-companion.sh"
if [ ! -f "$RUN_SCRIPT" ] || [ ! -x "$RUN_SCRIPT" ]; then
    echo "❌ run-companion.sh not found or not executable"
    exit 1
fi

echo "Testing companion app startup..."
echo ""

# Start companion app in background and capture PID
cd "$REPO_ROOT/companion"
bash "$RUN_SCRIPT" > /tmp/companion-startup-test.log 2>&1 &
COMPANION_PID=$!

sleep 3

# Check if process is still running
if ps -p $COMPANION_PID > /dev/null 2>&1; then
    echo "✅ Companion app started (PID: $COMPANION_PID)"
    
    # Check for errors in startup
    if grep -qi "error\|failed\|fatal" /tmp/companion-startup-test.log; then
        echo "⚠️  Warnings/errors in startup log:"
        grep -i "error\|failed\|fatal" /tmp/companion-startup-test.log | head -5 | sed 's/^/   /'
    else
        echo "✅ No errors in startup log"
    fi
    
    # Kill the process after a moment
    sleep 1
    kill $COMPANION_PID 2>/dev/null || true
    wait $COMPANION_PID 2>/dev/null || true
    echo "✅ Companion app stopped cleanly"
else
    echo "❌ Companion app did not start or exited immediately"
    echo "Startup log:"
    cat /tmp/companion-startup-test.log | head -20 | sed 's/^/   /'
fi
echo ""

echo "=== Step 3: Check Log Files ==="
LATEST_COMPANION_LOG="$LOG_DIR/companion-latest.log"
if [ -f "$LATEST_COMPANION_LOG" ]; then
    echo "✅ Companion log file exists: $LATEST_COMPANION_LOG"
    LOG_SIZE=$(wc -l < "$LATEST_COMPANION_LOG" 2>/dev/null || echo "0")
    echo "   Log size: $LOG_SIZE lines"
    if [ "$LOG_SIZE" -gt 0 ]; then
        echo "   Last 5 lines:"
        tail -5 "$LATEST_COMPANION_LOG" | sed 's/^/     /'
    fi
else
    echo "⚠️  No companion log file found yet (will be created on first run)"
fi
echo ""

echo "=== Summary ==="
echo "✅ Native messaging connection test completed"
echo "Log saved to: $LOG_FILE"
echo ""
echo "Next: Test companion app functionality with test-messaging.js"
