#!/bin/bash
# Run All Companion App Tests

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-companion-all-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="$LOG_DIR/test-companion-all-latest.log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=========================================="
echo "  Companion App Testing"
echo "=========================================="
echo "Timestamp: $(date)"
echo "Log file: $LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
echo ""

cd "$REPO_ROOT"

TOTAL_ERRORS=0

echo "=== Test 1: Installation Test ==="
echo ""
if [ -x "$REPO_ROOT/tests/test-companion-install.sh" ]; then
    bash "$REPO_ROOT/tests/test-companion-install.sh"
    INSTALL_RESULT=$?
    if [ $INSTALL_RESULT -ne 0 ]; then
        ((TOTAL_ERRORS++))
    fi
else
    echo "❌ test-companion-install.sh not found or not executable"
    ((TOTAL_ERRORS++))
fi
echo ""
echo "=========================================="
echo ""

echo "=== Test 2: Native Messaging Connection ==="
echo ""
if [ -x "$REPO_ROOT/tests/test-companion-messaging.sh" ]; then
    bash "$REPO_ROOT/tests/test-companion-messaging.sh"
    MESSAGING_RESULT=$?
    if [ $MESSAGING_RESULT -ne 0 ]; then
        ((TOTAL_ERRORS++))
    fi
else
    echo "❌ test-companion-messaging.sh not found or not executable"
    ((TOTAL_ERRORS++))
fi
echo ""
echo "=========================================="
echo ""

echo "=== Test 3: Functionality Tests ==="
echo ""
echo "⚠️  This test requires user interaction for folder picker."
echo "    Press Enter to continue, or Ctrl+C to skip..."
read -r
echo ""

if [ -x "$REPO_ROOT/tests/test-companion-functions.sh" ]; then
    bash "$REPO_ROOT/tests/test-companion-functions.sh"
    FUNCTIONS_RESULT=$?
    if [ $FUNCTIONS_RESULT -ne 0 ]; then
        ((TOTAL_ERRORS++))
    fi
else
    echo "❌ test-companion-functions.sh not found or not executable"
    ((TOTAL_ERRORS++))
fi
echo ""
echo "=========================================="
echo ""

echo "=== Final Summary ==="
echo ""
if [ $TOTAL_ERRORS -eq 0 ]; then
    echo "✅ All companion app tests completed successfully!"
    echo ""
    echo "Companion App Testing: PASSED"
else
    echo "❌ Some tests failed or had errors"
    echo "   Total errors: $TOTAL_ERRORS"
    echo ""
    echo "Companion App Testing: FAILED"
fi

echo ""
echo "All logs saved to: $LOG_DIR"
echo "View individual test logs:"
echo "  - Installation: $LOG_DIR/test-companion-install-latest.log"
echo "  - Messaging: $LOG_DIR/test-companion-messaging-latest.log"
echo "  - Functions: $LOG_DIR/test-companion-functions-latest.log"
echo ""
echo "Main log: $LOG_FILE"

exit $TOTAL_ERRORS
