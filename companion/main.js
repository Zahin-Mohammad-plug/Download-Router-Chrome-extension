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

// CRITICAL: Force stdin to binary mode IMMEDIATELY at process start
// NOTE: setEncoding(null) may not work reliably in Electron
// The encoding might still report as 'utf8' but we'll handle string chunks in the data handler
// This must happen before ANY data can arrive to prevent UTF-8 encoding corruption
// If data arrives before encoding is null, Node.js may interpret binary as UTF-8
// and replace invalid sequences with replacement characters (efbfbd)
try {
  // Set encoding to null (binary mode) - attempt multiple approaches
  process.stdin.setEncoding(null);
  
  // Force internal state if available (for Node.js streams)
  if (process.stdin._readableState) {
    process.stdin._readableState.encoding = null;
    process.stdin._readableState.objectMode = false;
  }
  
  // Also try setting decoder to null if it exists
  if (process.stdin._readableState && process.stdin._readableState.decoder) {
    process.stdin._readableState.decoder = null;
  }
  
  // NOTE: Even if encoding still reports as 'utf8', we'll handle it in the data handler
  // by converting string chunks to Buffers properly
} catch (err) {
  logToFile(`ERROR: Failed to set stdin encoding: ${err.message}`);
}

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
    logToFile('Received message: ' + JSON.stringify(message));
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
      
      // For messages that need native dialogs (pickFolder, showSaveAsDialog)
      // Use native OS commands instead of Electron for instant response
      if (message.type === 'pickFolder') {
        // Use native OS folder picker (no Electron needed)
        const nativeFolderPicker = require('./services/folder-picker-native');
        const result = await nativeFolderPicker.pickFolder(message.startPath || null);
        return result;
      }
      
      if (message.type === 'showSaveAsDialog') {
        // Use native OS Save As dialog (no Electron needed)
        logToFile('Received showSaveAsDialog message: ' + JSON.stringify({ filename: message.filename, defaultDirectory: message.defaultDirectory }));
        const fileSaveDialog = require('./services/file-save-dialog');
        const result = await fileSaveDialog.showSaveAsDialog(message.filename, message.defaultDirectory || null);
        logToFile('showSaveAsDialog result: ' + JSON.stringify(result));
        return result;
      }
      
      if (message.type === 'moveFile') {
        // Log moveFile requests for debugging
        logToFile('Received moveFile message: ' + JSON.stringify({ source: message.source, destination: message.destination }));
        const fileMover = require('./services/file-mover');
        const result = await fileMover.moveFile(message.source, message.destination);
        logToFile('moveFile result: ' + JSON.stringify(result));
        return result;
      }
      
      // For other messages, lazy-load handlers only when needed
      if (!handlers) {
        handlers = require('./native-messaging/handlers');
      }
      const result = await handlers.handleMessage(message, {});
      return result;
    } catch (error) {
      logToFile('Error handling message: ' + error.message + '\nStack: ' + error.stack);
      throw error;
    }
  });

// Note: stdin encoding is already set to null at the very start of main.js
// This prevents any data from being interpreted as UTF-8 before binary mode is active

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
