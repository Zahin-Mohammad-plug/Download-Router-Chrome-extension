/**
 * main.js
 * 
 * Purpose: Main entry point for Download Router Companion Electron application.
 * Role: Initializes native messaging host to communicate with Chrome extension,
 *       handles OS-level file operations, and provides native folder picker dialogs.
 * 
 * Key Responsibilities:
 * - Set up native messaging protocol communication via stdin/stdout
 * - Route messages to appropriate service handlers
 * - Provide native OS folder picker dialogs
 * - Handle file system operations (verify, create, list, move)
 * - Manage post-download file routing
 */

// CRITICAL: Load only essential modules first - defer Electron until after native messaging setup
const fs = require('fs');
const path = require('path');
const nativeMessagingHost = require('./native-messaging/host');

// Set up logging to logs/debug directory
const REPO_ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(REPO_ROOT, 'logs', 'debug');
const LOG_FILE = path.join(LOG_DIR, `companion-main-${Date.now()}.log`);
const LATEST_LOG = path.join(LOG_DIR, 'companion-main-latest.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Simple logging function
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    fs.appendFileSync(LATEST_LOG, logMessage);
  } catch (error) {
    // Can't log if logging fails
  }
}

logToFile(`=== Companion App Started ===`);
logToFile(`PID: ${process.pid}`);
logToFile(`Node version: ${process.version}`);
logToFile(`Platform: ${process.platform}`);
logToFile(`Log file: ${LOG_FILE}`);

// Defer Electron initialization - load it only when needed (for dialogs)
let electronLoaded = false;
let app = null;
let dialog = null;
let BrowserWindow = null;
let handlers = null;

function loadElectronIfNeeded() {
  if (!electronLoaded) {
    const electron = require('electron');
    app = electron.app;
    dialog = electron.dialog;
    BrowserWindow = electron.BrowserWindow;
    handlers = require('./native-messaging/handlers');
    electronLoaded = true;
    logToFile('Electron modules loaded (lazy)');
  }
}

// Electron app runs in background without visible window
// Native messaging communication happens via stdin/stdout
// Create a hidden window for dialogs (required on macOS)
let dialogWindow = null;

// DO NOT load handlers at module load - lazy load only when needed
// This ensures getVersion responds instantly without any module loading overhead

// CRITICAL: Register message handler BEFORE init() - otherwise messages can arrive
// before the handler is registered, causing "no handler" errors or delays
nativeMessagingHost.onMessage(async (message) => {
    try {
      // ULTRA-FAST path for getVersion - handle completely synchronously without any overhead
      if (message.type === 'getVersion') {
        // Direct response - no handlers, no Electron, no async
        const version = require('./package.json').version;
        const result = {
          success: true,
          type: 'version',
          version: version,
          platform: process.platform
        };
        return result;
      }
      
      // For messages that need native dialogs (pickFolder)
      // Use native OS commands instead of Electron for instant response
      if (message.type === 'pickFolder') {
        // Use native OS folder picker (no Electron needed)
        const nativeFolderPicker = require('./services/folder-picker-native');
        const result = await nativeFolderPicker.pickFolder(message.startPath || null);
        return result;
      }
      
      // For other messages, lazy-load handlers only when needed
      if (!handlers) {
        handlers = require('./native-messaging/handlers');
      }
      const result = await handlers.handleMessage(message, {});
      return result;
    } catch (error) {
      throw error;
    }
  });

// CRITICAL: Initialize native messaging host AFTER handler is registered
// Native messaging requires immediate stdin/stdout handling - Chrome will disconnect
// if the host doesn't respond quickly enough. Electron initialization is slow and blocks.
nativeMessagingHost.init();
logToFile('Native messaging host initialized (handler registered first)');

// Initialize Electron only when needed (lazy loading)
// Load it asynchronously so it doesn't block native messaging
setImmediate(() => {
  loadElectronIfNeeded();
  if (app) {
    // Prevent app from showing dock icon on macOS (runs in background)
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide();
    }
    
    // Prevent app from quitting when all windows are closed (no windows needed)
    app.on('window-all-closed', (e) => {
      e.preventDefault();
    });
    
    app.whenReady().then(() => {
      logToFile('Electron app ready (lazy loaded)');
    });
    
    app.on('before-quit', () => {
      nativeMessagingHost.cleanup();
    });
    
    process.on('SIGINT', () => {
      nativeMessagingHost.cleanup();
      if (app) app.quit();
    });
    
    process.on('SIGTERM', () => {
      nativeMessagingHost.cleanup();
      if (app) app.quit();
    });
  }
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  const errorMsg = `Uncaught exception: ${error.message}\n${error.stack}`;
  console.error(errorMsg);
  logToFile(`ERROR: ${errorMsg}`);
  // Send error response if possible
  if (nativeMessagingHost && nativeMessagingHost.isInitialized) {
    try {
      nativeMessagingHost.sendResponse({
        success: false,
        error: error.message,
        code: 'UNCAUGHT_ERROR'
      });
    } catch (e) {
      console.error('Failed to send error response:', e);
    }
  }
  // Don't exit - keep process alive for native messaging
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = `Unhandled rejection: ${reason}`;
  console.error(errorMsg);
  logToFile(`ERROR: ${errorMsg}`);
  if (reason && typeof reason === 'object' && reason.stack) {
    console.error('Rejection stack:', reason.stack);
    logToFile(`ERROR: Stack: ${reason.stack}`);
  }
});
