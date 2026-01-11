#!/bin/bash
# Quick script to view logs

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"

if [ ! -d "$LOG_DIR" ]; then
    echo "Log directory not found: $LOG_DIR"
    exit 1
fi

echo "=== Download Router Logs ==="
echo "Log directory: $LOG_DIR"
echo ""
echo "Available log files:"
ls -lth "$LOG_DIR" | head -10
echo ""
echo "Select log to view:"
echo "1. Latest companion log"
echo "2. Latest test flow log"
echo "3. Environment check log"
echo "4. List all logs"
echo "5. Tail latest companion log (live)"
read -p "Choice [1-5]: " choice

case $choice in
    1)
        if [ -f "$LOG_DIR/companion-latest.log" ]; then
            cat "$LOG_DIR/companion-latest.log"
        else
            echo "No companion log found"
        fi
        ;;
    2)
        if [ -f "$LOG_DIR/test-complete-flow-latest.log" ]; then
            cat "$LOG_DIR/test-complete-flow-latest.log"
        else
            echo "No test flow log found"
        fi
        ;;
    3)
        if [ -f "$LOG_DIR/environment-check.log" ]; then
            cat "$LOG_DIR/environment-check.log"
        else
            echo "No environment check log found"
        fi
        ;;
    4)
        ls -lth "$LOG_DIR"
        ;;
    5)
        if [ -f "$LOG_DIR/companion-latest.log" ]; then
            tail -f "$LOG_DIR/companion-latest.log"
        else
            echo "No companion log found"
        fi
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
