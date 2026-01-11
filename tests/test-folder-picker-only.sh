#!/bin/bash
# Quick Folder Picker Test - Just tests folder picker with logging

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/debug"
mkdir -p "$LOG_DIR"

cd "$REPO_ROOT/companion"

echo "=== Folder Picker Test ==="
echo ""
echo "This will test ONLY the folder picker."
echo "A dialog will open - please select a folder."
echo ""
echo "Starting in 2 seconds..."
sleep 2

# Create a simple test script
cat > /tmp/test-folder-picker.js << 'TESTEOF'
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const companionDir = process.argv[2];
const electronPath = path.join(companionDir, 'node_modules', '.bin', 'electron');
const mainJsPath = path.join(companionDir, 'main.js');

console.log('Starting companion app...');
console.log('Companion dir:', companionDir);
console.log('Electron:', electronPath);
console.log('Main JS:', mainJsPath);
console.log('');

if (!fs.existsSync(electronPath)) {
  console.error('Error: Electron not found at', electronPath);
  process.exit(1);
}

const companion = spawn(electronPath, [mainJsPath], {
  cwd: companionDir,
  stdio: ['pipe', 'pipe', 'inherit']
});

let stdoutBuffer = Buffer.alloc(0);

function sendMessage(msg) {
  const msgStr = JSON.stringify(msg);
  const length = Buffer.byteLength(msgStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(length, 0);
  companion.stdin.write(header);
  companion.stdin.write(msgStr, 'utf8');
  console.log('Sent:', msg.type);
}

companion.stdout.on('data', (data) => {
  stdoutBuffer = Buffer.concat([stdoutBuffer, data]);
  
  while (stdoutBuffer.length >= 4) {
    const length = stdoutBuffer.readUInt32LE(0);
    
    if (stdoutBuffer.length < 4 + length) {
      break;
    }
    
    const messageStr = stdoutBuffer.slice(4, 4 + length).toString('utf8');
    stdoutBuffer = stdoutBuffer.slice(4 + length);
    
    try {
      const message = JSON.parse(messageStr);
      console.log('Response:', JSON.stringify(message, null, 2));
      
      if (message.type === 'folderPicked') {
        if (message.success && message.path) {
          console.log('');
          console.log('SUCCESS! Folder selected:', message.path);
          console.log('');
          console.log('Check logs at: logs/debug/companion-main-latest.log');
        } else {
          console.log('');
          console.log('Folder selection cancelled or failed');
        }
        
        setTimeout(() => {
          companion.kill();
          process.exit(0);
        }, 1000);
      }
    } catch (error) {
      console.error('Parse error:', error.message);
    }
  }
});

companion.on('error', (error) => {
  console.error('Failed to start:', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Requesting folder picker...');
  console.log('');
  sendMessage({ 
    type: 'pickFolder',
    startPath: process.env.HOME || process.env.USERPROFILE || process.cwd()
  });
}, 3000);

setTimeout(() => {
  console.log('Timeout - killing companion app');
  companion.kill();
  process.exit(1);
}, 60000);
TESTEOF

echo "Running folder picker test..."
echo ""

node /tmp/test-folder-picker.js "$REPO_ROOT/companion"

TEST_RESULT=$?

echo ""
echo "=== Check Logs ==="
echo ""
echo "Companion main log:"
if [ -f "$LOG_DIR/companion-main-latest.log" ]; then
    echo "Last 20 lines:"
    tail -20 "$LOG_DIR/companion-main-latest.log" | sed 's/^/  /'
else
    echo "  (log file not found yet)"
fi

echo ""
echo "Companion script log:"
if [ -f "$LOG_DIR/companion-latest.log" ]; then
    echo "Last 20 lines:"
    tail -20 "$LOG_DIR/companion-latest.log" | sed 's/^/  /'
else
    echo "  (log file not found yet)"
fi

echo ""
echo "=== All Log Files ==="
ls -lth "$LOG_DIR"/*.log 2>/dev/null | head -10 || echo "  (no log files)"
echo ""

if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ Test completed!"
else
    echo "⚠️  Test exited with code: $TEST_RESULT"
fi
