/**
 * native-messaging-client.js
 * 
 * Purpose: Chrome extension client for native messaging communication.
 * Role: Provides wrapper functions for communicating with the companion app
 *       via Chrome's Native Messaging API.
 * 
 * Key Responsibilities:
 * - Manage native messaging port connections
 * - Send messages to companion app
 * - Handle responses and errors
 * - Provide high-level API for folder picker, folder operations, file moving
 * 
 * External Dependencies:
 *   - chrome.runtime.connectNative: Chrome API for connecting to native messaging host
 */

// Guard against multiple importScripts calls - only execute if not already loaded
// This prevents "already declared" errors when service worker reloads
(function() {
  // Check if already loaded in service worker context (both class and instance exist)
  if (typeof self !== 'undefined' && self.NativeMessagingClient && self.nativeMessagingClient) {
    return; // Already loaded, skip
  }

/**
 * Native Messaging Client class
 * Handles communication with the companion app via Chrome Native Messaging API.
 */
class NativeMessagingClient {
  constructor() {
    this.hostName = 'com.downloadrouter.host';
    this.activePorts = new Map(); // Track active connections by request ID
    this.requestCounter = 0; // Generate unique request IDs
  }

  /**
   * Connects to the native messaging host and sends a message.
   * 
   * Inputs:
   *   - message: Object containing message type and data
   *   - timeout: Number milliseconds to wait for response (default: 10000)
   * 
   * Outputs: Promise resolving to response object or rejecting on error
   * 
   * External Dependencies:
   *   - chrome.runtime.connectNative: Chrome API for native messaging connection
   */
  sendMessage(message, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestCounter;
      
      try {
        // chrome.runtime.connectNative: Connects to native messaging host
        //   Inputs: Host name string
        //   Outputs: Port object for sending/receiving messages
        const port = chrome.runtime.connectNative(this.hostName);
        
        // Track if we've already handled the response
        let responseHandled = false;
        
        // Store port with request ID for tracking
        this.activePorts.set(requestId, { port, resolve, reject });
        
        // Set up timeout
        const timeoutId = setTimeout(() => {
          if (!responseHandled) {
            responseHandled = true;
            port.disconnect();
            this.activePorts.delete(requestId);
            reject(new Error('Request timeout'));
          }
        }, timeout);
        
        // Handle response messages
        // port.onMessage.addListener: Listens for messages from native host
        //   Inputs: Callback function (message object)
        //   Outputs: None (sets up listener)
        port.onMessage.addListener((response) => {
          // Mark response as handled to prevent disconnect handler from firing
          if (responseHandled) {
            return; // Already handled
          }
          responseHandled = true;
          
          clearTimeout(timeoutId);
          port.disconnect();
          this.activePorts.delete(requestId);
          
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        });
        
        // Handle disconnection (host not available, crashed, etc.)
        // port.onDisconnect.addListener: Listens for disconnection events
        //   Inputs: Callback function
        //   Outputs: None (sets up listener)
        port.onDisconnect.addListener(() => {
          // Ignore disconnect if we already handled the response successfully
          // Manual disconnect after successful response is expected and should not trigger errors
          if (responseHandled) {
            return;
          }
          
          responseHandled = true;
          clearTimeout(timeoutId);
          this.activePorts.delete(requestId);
          
          // Check for lastError safely - but note that lastError might be stale
          // Chrome's lastError is only valid immediately after an API call
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // chrome.runtime.lastError: Contains error information from last Chrome API call
            const errorMsg = lastError.message || 'Native host disconnected';
            console.error('Native messaging disconnected:', errorMsg);
            console.error('LastError details:', JSON.stringify({
              message: lastError.message,
              toString: lastError.toString()
            }));
            reject(new Error(errorMsg));
          } else {
            console.error('Native messaging disconnected (no lastError)');
            console.error('Message that failed:', JSON.stringify(message));
            reject(new Error('Native host disconnected'));
          }
        });
        
        // Send message to native host
        // port.postMessage: Sends message to native host
        //   Inputs: Message object (must be JSON-serializable)
        //   Outputs: None (sends asynchronously)
        port.postMessage(message);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Picks a folder using native OS dialog.
   * 
   * Inputs:
   *   - startPath: Optional string absolute path to start dialog at
   * 
   * Outputs: Promise resolving to absolute path string or rejecting on cancel/error
   */
  async pickFolder(startPath = null) {
    try {
      const response = await this.sendMessage({
        type: 'pickFolder',
        startPath: startPath
      });
      
      if (response.success && response.path) {
        return response.path;
      } else {
        throw new Error(response.error || 'Failed to pick folder');
      }
    } catch (error) {
      if (error.message.includes('cancelled') || error.message.includes('CANCELLED')) {
        return null; // User cancelled - return null instead of throwing
      }
      throw error;
    }
  }

  /**
   * Verifies if a folder exists.
   * 
   * Inputs:
   *   - folderPath: String absolute path to folder
   * 
   * Outputs: Promise resolving to boolean (true if exists and accessible)
   */
  async verifyFolder(folderPath) {
    try {
      const response = await this.sendMessage({
        type: 'verifyFolder',
        path: folderPath
      });
      
      return response.success && response.exists === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Creates a folder (and parent directories if needed).
   * 
   * Inputs:
   *   - folderPath: String absolute path to folder to create
   * 
   * Outputs: Promise resolving to boolean (true if created successfully)
   */
  async createFolder(folderPath) {
    try {
      const response = await this.sendMessage({
        type: 'createFolder',
        path: folderPath
      });
      
      return response.success && response.created === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lists folder contents.
   * 
   * Inputs:
   *   - folderPath: String absolute path to folder
   * 
   * Outputs: Promise resolving to array of folder items or empty array on error
   */
  async listFolders(folderPath) {
    try {
      const response = await this.sendMessage({
        type: 'listFolders',
        path: folderPath
      });
      
      if (response.success && response.items) {
        return response.items;
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Moves a file from source to destination.
   * 
   * Inputs:
   *   - sourcePath: String absolute path to source file
   *   - destinationPath: String absolute path to destination (file or folder)
   * 
   * Outputs: Promise resolving to boolean (true if moved successfully)
   */
  async moveFile(sourcePath, destinationPath) {
    try {
      const response = await this.sendMessage({
        type: 'moveFile',
        source: sourcePath,
        destination: destinationPath
      });
      
      return response.success && response.moved === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if companion app is installed and returns version.
   * 
   * Inputs: None
   * 
   * Outputs: Promise resolving to object with installed boolean and version string
   */
  async checkCompanionApp() {
    try {
      // Increase timeout to account for process startup delay
      // Native messaging hosts need time to initialize (Electron startup ~300-400ms)
      const response = await this.sendMessage({ type: 'getVersion' }, 5000);
      
      if (response.success && response.type === 'version') {
        return {
          installed: true,
          version: response.version,
          platform: response.platform
        };
      }
      
      return { installed: false };
    } catch (error) {
      return { installed: false, error: error.message };
    }
  }
}

// Export singleton instance - check if already exists to avoid redeclaration
// This prevents errors when importScripts is called multiple times
// IMPORTANT: Do NOT declare nativeMessagingClient as a var/let/const in service worker context
// because importScripts can run multiple times, causing "already declared" errors
// Instead, only set it on self, and background.js should access it via self.nativeMessagingClient

if (typeof self !== 'undefined') {
  // Service worker context (Manifest V3)
  // Only create if it doesn't already exist
  if (!self.nativeMessagingClient) {
    self.nativeMessagingClient = new NativeMessagingClient();
  }
  // Do NOT declare a local variable here - it causes redeclaration errors with importScripts
} else {
  // Node.js/CommonJS context - safe to declare here
  var nativeMessagingClient = new NativeMessagingClient();
}

// Export class for testing (Node.js/CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NativeMessagingClient, nativeMessagingClient };
}

// Store class on self for service worker context
if (typeof self !== 'undefined') {
  self.NativeMessagingClient = NativeMessagingClient;
}

})(); // End of IIFE guard
