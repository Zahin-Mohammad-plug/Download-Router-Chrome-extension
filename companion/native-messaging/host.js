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

class NativeMessagingHost {
  constructor() {
    this.messageHandlers = [];
    this.isInitialized = false;
    this.buffer = Buffer.alloc(0);
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

    // Set stdin to binary mode for native messaging protocol
    // stdin: Standard input stream from Chrome
    // stdout: Standard output stream to Chrome
    process.stdin.setEncoding(null); // Binary mode - returns Buffers
    
    // Resume stdin to start receiving data (it's paused by default)
    process.stdin.resume();
    
    // Handle incoming messages from stdin using data event for better reliability
    process.stdin.on('data', (chunk) => {
      // Ensure chunk is a Buffer
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      console.error(`Received ${chunkBuffer.length} bytes`);
      this.buffer = Buffer.concat([this.buffer, chunkBuffer]);
      this.processBuffer();
    });

    // Handle stdin close (Chrome disconnected)
    process.stdin.on('end', () => {
      this.cleanup();
      process.exit(0);
    });

    // Handle errors
    process.stdin.on('error', (error) => {
      console.error('Stdin error:', error);
    });

    // Log initialization (to stderr so it doesn't interfere with protocol)
    console.error('Native messaging host initialized and ready');

    this.isInitialized = true;
  }

  /**
   * Processes accumulated buffer to extract and handle messages.
   * Follows Native Messaging protocol: 32-bit length prefix + JSON body.
   * 
   * Inputs: None (uses this.buffer)
   * Outputs: None (calls message handlers)
   */
  processBuffer() {
    // Try to parse messages from buffer
    while (this.buffer.length >= 4) {
      // Read 4 bytes for message length (32-bit unsigned integer)
      const messageLength = this.buffer.readUInt32LE(0);

      if (messageLength === 0 || messageLength > 1024 * 1024) {
        // Invalid message (0 length or too large)
        this.buffer = Buffer.alloc(0);
        return;
      }

      // Check if we have the full message
      if (this.buffer.length < 4 + messageLength) {
        // Not enough data yet, wait for more
        return;
      }

      // Extract message body (JSON string)
      const messageBuffer = this.buffer.slice(4, 4 + messageLength);
      // Remove processed message from buffer
      this.buffer = this.buffer.slice(4 + messageLength);

      try {
        // Parse JSON message
        // toString: Converts buffer to UTF-8 string
        //   Inputs: Encoding ('utf8')
        //   Outputs: String
        // JSON.parse: Parses JSON string to object
        //   Inputs: JSON string
        //   Outputs: Parsed object
        const messageJson = messageBuffer.toString('utf8');
        console.error(`Parsing message: ${messageJson.substring(0, 100)}`);
        const message = JSON.parse(messageJson);

        // Process message through handlers
        this.processMessage(message);
      } catch (error) {
        // Send error response if message parsing fails
        console.error('Parse error:', error.message);
        this.sendResponse({
          success: false,
          error: 'Invalid JSON message: ' + error.message,
          code: 'PARSE_ERROR'
        });
      }
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
      // Force flush to ensure data is sent immediately
      if (process.stdout.flush) {
        process.stdout.flush();
      }
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
   * Resets state and clears buffer.
   * 
   * Inputs: None
   * Outputs: None (cleans up resources)
   */
  cleanup() {
    this.buffer = Buffer.alloc(0);
    this.isInitialized = false;
  }
}

// Export singleton instance
module.exports = new NativeMessagingHost();
