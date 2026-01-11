/**
 * host.js
 * 
 * Purpose: Native Messaging Host protocol implementation.
 * Role: Handles Chrome Native Messaging protocol communication via stdin/stdout.
 * 
 * Native Messaging Protocol:
 * - Messages are JSON strings, UTF-8 encoded
 * - Each message is prefixed with 32-bit length (native byte order)
 * - Messages read from stdin, responses written to stdout
 * - Connection persists until stdin closes
 */

const readline = require('readline');

class NativeMessagingHost {
  constructor() {
    this.rl = null;
    this.messageHandlers = [];
    this.isInitialized = false;
  }

  /**
   * Initializes the native messaging host.
   * Sets up stdin/stdout for message communication.
   * 
   * Inputs: None
   * Outputs: None (sets up stdin/stdout listeners)
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    // Set up readline interface for reading from stdin
    // stdin: Standard input stream from Chrome
    // stdout: Standard output stream to Chrome
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // Handle incoming messages from stdin
    process.stdin.on('readable', () => {
      this.readMessage();
    });

    // Handle stdin close (Chrome disconnected)
    process.stdin.on('end', () => {
      this.cleanup();
      process.exit(0);
    });

    this.isInitialized = true;
  }

  /**
   * Reads a message from stdin following Native Messaging protocol.
   * Reads 32-bit length prefix, then JSON message body.
   * 
   * Inputs: None (reads from process.stdin)
   * Outputs: None (calls message handlers)
   */
  readMessage() {
    // Read 4 bytes for message length (32-bit unsigned integer)
    const lengthBuffer = process.stdin.read(4);
    if (!lengthBuffer) {
      return; // Not enough data yet
    }

    // Convert buffer to 32-bit unsigned integer (native byte order)
    // Buffer.readUInt32LE: Reads unsigned 32-bit integer in little-endian
    //   Inputs: Offset (0)
    //   Outputs: Number (message length in bytes)
    const messageLength = lengthBuffer.readUInt32LE(0);

    if (messageLength === 0) {
      return; // Invalid message
    }

    // Read message body (JSON string)
    const messageBuffer = process.stdin.read(messageLength);
    if (!messageBuffer || messageBuffer.length !== messageLength) {
      // Put length buffer back for next attempt
      process.stdin.unshift(lengthBuffer);
      return;
    }

    try {
      // Parse JSON message
      // toString: Converts buffer to UTF-8 string
      //   Inputs: Encoding ('utf8')
      //   Outputs: String
      // JSON.parse: Parses JSON string to object
      //   Inputs: JSON string
      //   Outputs: Parsed object
      const message = JSON.parse(messageBuffer.toString('utf8'));

      // Process message through handlers
      this.processMessage(message);
    } catch (error) {
      // Send error response if message parsing fails
      this.sendResponse({
        success: false,
        error: 'Invalid JSON message',
        code: 'PARSE_ERROR'
      });
    }
  }

  /**
   * Processes a message through registered handlers.
   * Handlers are called sequentially until one returns a response.
   * 
   * Inputs:
   *   - message: Object containing message type and data
   * 
   * Outputs: None (sends response via sendResponse)
   */
  async processMessage(message) {
    for (const handler of this.messageHandlers) {
      try {
        // Handler returns response object or Promise resolving to response
        const response = await handler(message);
        if (response) {
          this.sendResponse(response);
          return;
        }
      } catch (error) {
        // Send error response if handler throws
        this.sendResponse({
          success: false,
          error: error.message || 'Unknown error',
          code: 'HANDLER_ERROR',
          type: message.type
        });
        return;
      }
    }

    // No handler processed the message
    this.sendResponse({
      success: false,
      error: `Unknown message type: ${message.type}`,
      code: 'UNKNOWN_TYPE',
      type: message.type
    });
  }

  /**
   * Sends a response message to Chrome via stdout.
   * Formats message according to Native Messaging protocol.
   * 
   * Inputs:
   *   - response: Object containing response data
   * 
   * Outputs: None (writes to process.stdout)
   * 
   * External Dependencies:
   *   - process.stdout: Standard output stream to Chrome
   *   - Buffer: Node.js buffer for binary data
   */
  sendResponse(response) {
    try {
      // Convert response object to JSON string
      // JSON.stringify: Converts object to JSON string
      //   Inputs: Object to stringify
      //   Outputs: JSON string
      const responseJson = JSON.stringify(response);
      
      // Convert JSON string to UTF-8 buffer
      // Buffer.from: Creates buffer from string
      //   Inputs: String, encoding ('utf8')
      //   Outputs: Buffer object
      const responseBuffer = Buffer.from(responseJson, 'utf8');
      
      // Create length buffer (4 bytes for 32-bit unsigned integer)
      const lengthBuffer = Buffer.allocUnsafe(4);
      // writeUInt32LE: Writes 32-bit unsigned integer in little-endian
      //   Inputs: Value (buffer length), offset (0)
      //   Outputs: Number (bytes written)
      lengthBuffer.writeUInt32LE(responseBuffer.length, 0);
      
      // Write length prefix and message body to stdout
      // process.stdout.write: Writes buffer to stdout
      //   Inputs: Buffer or string
      //   Outputs: Boolean (true if all data written)
      process.stdout.write(lengthBuffer);
      process.stdout.write(responseBuffer);
    } catch (error) {
      // If response sending fails, write error to stderr (not sent to Chrome)
      console.error('Failed to send response:', error);
    }
  }

  /**
   * Registers a message handler function.
   * Handlers are called in registration order until one returns a response.
   * 
   * Inputs:
   *   - handler: Async function(message) that returns response object or null
   * 
   * Outputs: None (registers handler)
   */
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  /**
   * Cleans up native messaging host resources.
   * Closes readline interface and resets state.
   * 
   * Inputs: None
   * Outputs: None (cleans up resources)
   */
  cleanup() {
    if (this.rl) {
      // close: Closes readline interface
      //   Inputs: None
      //   Outputs: None (closes streams)
      this.rl.close();
      this.rl = null;
    }
    this.isInitialized = false;
  }
}

// Export singleton instance
module.exports = new NativeMessagingHost();
