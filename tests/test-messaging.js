/**
 * test-messaging.js
 * 
 * Purpose: Manual test script for native messaging protocol.
 * Role: Tests companion app communication without Chrome extension.
 * 
 * Usage: node test-messaging.js
 * 
 * This script spawns the companion app and sends test messages to verify
 * the native messaging protocol works correctly.
 */

const { spawn } = require('child_process');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Start companion app
log('Starting companion app...', colors.blue);
// Ensure PATH includes common Node.js locations
const env = { ...process.env };
const homebrewPath = '/opt/homebrew/bin';
if (!env.PATH.includes(homebrewPath)) {
  env.PATH = `${homebrewPath}:${env.PATH}`;
}

// Spawn Electron directly (not npm start) so we can communicate via stdin/stdout
// Fix paths - test-messaging.js is in tests/, companion is in companion/
const companionDir = path.join(__dirname, '..', 'companion');
const electronPath = path.join(companionDir, 'node_modules', '.bin', 'electron');
const mainJsPath = path.join(companionDir, 'main.js');

// Check if Electron exists
if (!require('fs').existsSync(electronPath)) {
  log(`Error: Electron not found at ${electronPath}`, colors.red);
  log('Please run "npm install" in the companion directory', colors.yellow);
  process.exit(1);
}

log(`Electron path: ${electronPath}`, colors.cyan);
log(`Main JS path: ${mainJsPath}`, colors.cyan);
log(`Working directory: ${companionDir}`, colors.cyan);

const companion = spawn(electronPath, [mainJsPath], {
  cwd: companionDir,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: env
});

let stdoutBuffer = Buffer.alloc(0);
let testResults = [];

// Helper to send native messaging format message
function sendMessage(msg) {
  const msgStr = JSON.stringify(msg);
  const length = Buffer.byteLength(msgStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(length, 0);
  
  companion.stdin.write(header);
  companion.stdin.write(msgStr, 'utf8');
  
  log(`  → Sent: ${msg.type}`, colors.cyan);
}

// Helper to read native messaging format response
companion.stdout.on('data', (data) => {
  stdoutBuffer = Buffer.concat([stdoutBuffer, data]);
  
  // Try to read messages from buffer
  while (stdoutBuffer.length >= 4) {
    const length = stdoutBuffer.readUInt32LE(0);
    
    if (stdoutBuffer.length < 4 + length) {
      // Not enough data yet, wait for more
      break;
    }
    
    // Extract message
    const messageStr = stdoutBuffer.slice(4, 4 + length).toString('utf8');
    stdoutBuffer = stdoutBuffer.slice(4 + length);
    
    try {
      const message = JSON.parse(messageStr);
      
      if (message.success) {
        log(`  ← Success: ${message.type || 'response'}`, colors.green);
        if (message.version) {
          log(`     Version: ${message.version}`, colors.green);
          log(`     Platform: ${message.platform}`, colors.green);
        }
        if (message.path) {
          log(`     Path: ${message.path}`, colors.green);
        }
        if (message.exists !== undefined) {
          log(`     Exists: ${message.exists}`, colors.green);
        }
      } else {
        log(`  ← Error: ${message.error || 'Unknown error'}`, colors.red);
        if (message.code) {
          log(`     Code: ${message.code}`, colors.red);
        }
      }
      
      testResults.push({
        success: message.success,
        type: message.type,
        error: message.error
      });
    } catch (error) {
      log(`  ← Parse error: ${error.message}`, colors.red);
    }
  }
});

companion.on('error', (error) => {
  log(`Failed to start companion app: ${error.message}`, colors.red);
  log('Make sure you have run "npm install" in the companion directory', colors.yellow);
  process.exit(1);
});

if (companion.stderr) {
  companion.stderr.on('data', (data) => {
    log(`Companion stderr: ${data.toString()}`, colors.yellow);
  });
}

companion.on('exit', (code) => {
  if (code !== null && code !== 0) {
    log(`\nCompanion app exited with code ${code}`, colors.red);
  }
});

// Test sequence
log('\n=== Native Messaging Protocol Tests ===\n', colors.blue);
log('Waiting for Electron to initialize...', colors.cyan);

// Wait longer for Electron app.whenReady() to complete
setTimeout(() => {
  log('Test 1: Get version', colors.yellow);
  sendMessage({ type: 'getVersion' });
}, 3000); // Increased delay for Electron initialization

setTimeout(() => {
  log('\nTest 2: Verify folder exists', colors.yellow);
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  log(`  Checking: ${homeDir}`, colors.cyan);
  sendMessage({ type: 'verifyFolder', path: homeDir });
}, 4500);

setTimeout(() => {
  log('\nTest 3: Verify non-existent folder', colors.yellow);
  const fakeDir = path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), 'NonExistentFolder12345');
  log(`  Checking: ${fakeDir}`, colors.cyan);
  sendMessage({ type: 'verifyFolder', path: fakeDir });
}, 6000);

setTimeout(() => {
  log('\nTest 4: Pick folder (native dialog will open)', colors.yellow);
  log('  Please select a folder in the dialog that opens...', colors.cyan);
  const startPath = process.env.HOME || process.env.USERPROFILE || process.cwd();
  sendMessage({ type: 'pickFolder', startPath: startPath });
}, 7500);

// Keep alive and show summary
setTimeout(() => {
  log('\n=== Test Summary ===\n', colors.blue);
  
  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;
  const total = testResults.length;
  
  log(`Total tests: ${total}`, colors.cyan);
  log(`Passed: ${passed}`, colors.green);
  log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.green);
  
  if (total === 0) {
    log('\n⚠ No responses received. Check if companion app is running correctly.', colors.yellow);
  } else if (failed === 0 && total >= 3) {
    log('\n✅ All tests passed! Native messaging is working correctly.', colors.green);
  } else if (failed > 0) {
    log('\n❌ Some tests failed. Check error messages above.', colors.red);
  }
  
  log('\nShutting down...', colors.blue);
  companion.kill();
  process.exit(failed === 0 && total >= 3 ? 0 : 1);
}, 30000); // 30 second timeout

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\nInterrupted by user. Shutting down...', colors.yellow);
  companion.kill();
  process.exit(0);
});

log('\nTests will run automatically. Press Ctrl+C to exit early.\n', colors.cyan);
