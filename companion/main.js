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

const { app, dialog } = require('electron');
const nativeMessagingHost = require('./native-messaging/host');
const handlers = require('./native-messaging/handlers');

// Electron app runs in background without visible window
// Native messaging communication happens via stdin/stdout
app.whenReady().then(() => {
  // Initialize native messaging host
  nativeMessagingHost.init();
  console.log('Native messaging host initialized and ready');
  
  // Register message handlers
  nativeMessagingHost.onMessage((message) => {
    return handlers.handleMessage(message, { dialog });
  });
  
  // Handle app termination gracefully
  app.on('before-quit', () => {
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
  console.error('Uncaught exception:', error);
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
  console.error('Unhandled rejection:', reason);
});
