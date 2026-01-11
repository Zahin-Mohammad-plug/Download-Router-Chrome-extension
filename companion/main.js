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

const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const nativeMessagingHost = require('./native-messaging/host');
const handlers = require('./native-messaging/handlers');

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
    console.error('Failed to write to log file:', error);
  }
}

logToFile(`=== Companion App Started ===`);
logToFile(`PID: ${process.pid}`);
logToFile(`Node version: ${process.version}`);
logToFile(`Electron version: ${process.versions.electron || 'unknown'}`);
logToFile(`Platform: ${process.platform}`);
logToFile(`Log file: ${LOG_FILE}`);

// Electron app runs in background without visible window
// Native messaging communication happens via stdin/stdout
// Create a hidden window for dialogs (required on macOS)
let dialogWindow = null;

app.whenReady().then(() => {
  logToFile('Electron app ready');
  
  // Create hidden window for dialogs (required for dialog.showOpenDialog on macOS)
  dialogWindow = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  dialogWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: false });
  
  // Initialize native messaging host
  nativeMessagingHost.init();
  logToFile('Native messaging host initialized and ready');
  console.log('Native messaging host initialized and ready');
  
  // Register message handlers
  nativeMessagingHost.onMessage(async (message) => {
    logToFile(`Received message type: ${message.type}`);
    try {
      // Ensure dialog window exists and app is focused for dialogs
      if (message.type === 'pickFolder' && dialogWindow) {
        dialogWindow.focus();
      }
      const result = await handlers.handleMessage(message, { dialog, dialogWindow });
      logToFile(`Message handler result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logToFile(`Error handling message: ${error.message}\n${error.stack}`);
      throw error;
    }
  });
  
  // Handle app termination gracefully
  app.on('before-quit', () => {
    if (dialogWindow) {
      dialogWindow.destroy();
      dialogWindow = null;
    }
    nativeMessagingHost.cleanup();
  });
  
  // Handle process signals for graceful shutdown
  process.on('SIGINT', () => {
    nativeMessagingHost.cleanup();
    app.quit();
  });
  
  process.on('SIGTERM', () => {
    nativeMessagingHost.cleanup();
    app.quit();
  });
});

// Prevent app from showing dock icon on macOS (runs in background)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

// Prevent app from quitting when all windows are closed (no windows needed)
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  const errorMsg = `Uncaught exception: ${error.message}\n${error.stack}`;
  console.error(errorMsg);
  logToFile(`ERROR: ${errorMsg}`);
  // Send error response if possible
  if (nativeMessagingHost && nativeMessagingHost.isInitialized) {
    nativeMessagingHost.sendResponse({
      success: false,
      error: error.message,
      code: 'UNCAUGHT_ERROR'
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = `Unhandled rejection: ${reason}`;
  console.error(errorMsg);
  logToFile(`ERROR: ${errorMsg}`);
});
