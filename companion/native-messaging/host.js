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
    this.reconnectTimeout = null;
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

    // Log initialization attempt (minimal logging - avoid slowing down)
    // console.error('Initializing native messaging host...');
    
    // Set stdin to binary mode for native messaging protocol
    // stdin: Standard input stream from Chrome
    // stdout: Standard output stream to Chrome
    process.stdin.setEncoding(null); // Binary mode - returns Buffers
    
    // Set stdout to blocking mode if possible (Node.js internal API)
    // This ensures writes complete synchronously when possible
    if (process.stdout._handle && typeof process.stdout._handle.setBlocking === 'function') {
      try {
        process.stdout._handle.setBlocking(true);
      } catch (e) {
        // Ignore errors
      }
    }
    
    // CRITICAL: Register data handler BEFORE resuming stdin
    // If we resume first, we might miss the first message chunk
    // Handle incoming messages from stdin - CRITICAL: Process immediately, no delays
    process.stdin.on('data', (chunk) => {
      // Ensure chunk is a Buffer
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      // Process immediately - don't defer, don't log (all adds latency)
      this.buffer = Buffer.concat([this.buffer, chunkBuffer]);
      this.processBuffer();
    });
    
    // Cancel any pending exit timeout - we're getting activity
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Resume stdin LAST - after all handlers are registered
    // This ensures we're ready to process messages immediately when data arrives
    process.stdin.resume();

    // Handle stdin close (Chrome disconnected)
    // CRITICAL: Don't exit immediately - keep process alive for next connection
    // Chrome may reconnect quickly, and process startup is slow
    process.stdin.on('end', () => {
      this.cleanup();
      // Don't exit immediately - give Chrome a chance to reconnect
      // Only exit if no activity for 5 seconds
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      this.reconnectTimeout = setTimeout(() => {
        process.exit(0);
      }, 5000);
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
        // Don't log parsing - slows down response
        // console.error(`Parsing message: ${messageJson.substring(0, 100)}`);
        const message = JSON.parse(messageJson);

        // Process message through handlers IMMEDIATELY (synchronously if possible)
        // Chrome has a very short timeout (~150ms), we must respond as fast as possible
        this.processMessage(message).catch((err) => {
          console.error('Unhandled error in processMessage:', err.message);
          console.error('Stack:', err.stack);
          this.sendResponse({
            success: false,
            error: 'Processing error: ' + err.message,
            code: 'PROCESS_ERROR'
          });
        });
      } catch (error) {
        // Send error response if message parsing fails
        console.error('Parse error:', error.message);
        console.error('Stack:', error.stack);
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
    // CRITICAL: For fast responses, process handlers immediately
    // For simple messages like getVersion, try to handle synchronously
    for (const handler of this.messageHandlers) {
      try {
        // Execute handler - if it's a Promise, await it, otherwise use result directly
        const handlerResult = handler(message);
        const response = handlerResult instanceof Promise ? await handlerResult : handlerResult;
        if (response) {
          this.sendResponse(response);
          return;
        }
      } catch (error) {
        // Send error response if handler throws
        console.error('Handler error:', error.message);
        console.error('Handler error stack:', error.stack);
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
      
      // Combine length and body into single buffer for atomic write
      // This avoids buffer issues with separate writes
      const fullResponseBuffer = Buffer.concat([lengthBuffer, responseBuffer]);
      
      // CRITICAL FIX: Use fs.writeSync directly to stdout file descriptor for synchronous write
      // This bypasses Node.js stream buffering which causes write() to return false
      // Native messaging requires immediate, synchronous output
      let written = false;
      try {
        // Try direct file descriptor write first (synchronous, bypasses buffering)
        if (process.stdout.fd !== undefined && process.stdout.fd !== null) {
          const fs = require('fs');
          const bytesWritten = fs.writeSync(process.stdout.fd, fullResponseBuffer, 0, fullResponseBuffer.length);
          written = (bytesWritten === fullResponseBuffer.length);
        } else {
          // Fallback to stream write if FD not available
          written = process.stdout.write(fullResponseBuffer);
        }
      } catch (writeError) {
        // Check if error is EPIPE (broken pipe) - Chrome already disconnected
        // Don't throw in this case, just log silently
        if (writeError.code === 'EPIPE') {
          // Chrome disconnected before we could respond - expected if timeout
          // Don't log to avoid noise
        } else {
          console.error('stdout write error:', writeError);
          throw writeError;
        }
      }
      
      // If using stream write and it returned false, handle drain
      if (!written && process.stdout.fd === undefined) {
        process.stdout.once('drain', () => {
          // Drain complete
        });
      }
      
      // Force sync/flush if available
      if (process.stdout.flush) {
        try {
          process.stdout.flush();
        } catch (flushError) {
          // Ignore flush errors
        }
      }
      
      // Force flush to ensure data is sent immediately
      // For native messaging, we MUST flush stdout after writing
      // Use setImmediate to ensure writes complete before flush
      setImmediate(() => {
        if (process.stdout.flush) {
          process.stdout.flush();
        }
      });
    } catch (error) {
      // If response sending fails, write error to stderr (not sent to Chrome)
      console.error('Failed to send response:', error);
      console.error('Error stack:', error.stack);
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
