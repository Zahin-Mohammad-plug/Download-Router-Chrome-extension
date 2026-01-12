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
    
    // Note: stdin encoding should already be set to null in main.js at process start
    // However, some Node.js/Electron versions don't respect setEncoding(null) properly
    // Force binary mode here as well as a safeguard
    // stdin: Standard input stream from Chrome
    // stdout: Standard output stream to Chrome
    try {
      process.stdin.setEncoding(null); // Binary mode - returns Buffers
      // Force internal encoding state if available
      if (process.stdin._readableState) {
        process.stdin._readableState.encoding = null;
      }
    } catch (err) {
      // Log but continue - we'll handle string chunks in data handler
    }
    
    // CRITICAL: Clear buffer on init AFTER setting encoding to prevent corruption
    // Each new connection should start with a fresh buffer
    // Do this AFTER setEncoding to ensure any buffered data is in correct format
    this.buffer = Buffer.alloc(0);
    
    // Set stdout to blocking mode if possible (Node.js internal API)
    // This ensures writes complete synchronously when possible
    if (process.stdout._handle && typeof process.stdout._handle.setBlocking === 'function') {
      try {
        process.stdout._handle.setBlocking(true);
      } catch (e) {
        // Ignore errors
      }
    }
    
    // CRITICAL: Remove any existing data listeners to prevent duplicate handlers
    // This prevents buffer corruption from multiple handlers processing the same data
    process.stdin.removeAllListeners('data');
    
    // CRITICAL: Pause stdin before setting up handlers to prevent data loss/corruption
    // We'll resume it after handlers are ready
    process.stdin.pause();
    
    // CRITICAL: Register data handler BEFORE resuming stdin
    // If we resume first, we might miss the first message chunk
    // Handle incoming messages from stdin - CRITICAL: Process immediately, no delays
    // NOTE: We'll handle both Buffer and String chunks to work around encoding issues
    process.stdin.on('data', (chunk) => {
      // CRITICAL: Handle chunks that arrive as strings (encoding issue)
      // Even with setEncoding(null), chunks may arrive as strings in some Node.js/Electron versions
      // We must convert string chunks to Buffer and handle any UTF-8 corruption
      let chunkBuffer;
      if (Buffer.isBuffer(chunk)) {
        chunkBuffer = chunk;
      } else if (typeof chunk === 'string') {
        // Chunk arrived as string - ROOT CAUSE: encoding wasn't properly set to null
        // Electron/Node.js is interpreting binary data as UTF-8 strings
        // When binary bytes that aren't valid UTF-8 arrive, they get replaced with (efbfbd)
        // We need to convert the string back to a Buffer, but this is tricky:
        // - If string contains replacement chars (), the original binary data is lost
        // - We can only recover if the string is valid UTF-8 (which native messaging JSON is)
        
        // Convert string to UTF-8 buffer
        // Native messaging protocol uses UTF-8 JSON, so converting string->UTF-8 buffer should work
        // However, if the original binary had invalid UTF-8 bytes, they may have been replaced
        // with replacement characters () which we need to handle
        try {
          // Check for replacement character (indicates binary data was corrupted)
          const hasReplacement = chunk.includes('\uFFFD') || chunk.includes('');
          
          if (hasReplacement) {
            // Try to skip replacement chars and find the actual message
            // Replacement char is 3 bytes (efbfbd), so we need to skip those
            // But this is complex - better to prevent the issue
            // For now, convert what we have and let buffer recovery handle it
          }
          
          // CRITICAL: Native messaging protocol format is:
          // [4-byte binary length (little-endian uint32)] + [UTF-8 JSON string]
          // If the chunk arrives as a string, the 4-byte binary header may have been
          // interpreted as UTF-8, causing corruption. However, Chrome sends valid UTF-8
          // JSON after the header, so we can reconstruct it.
          // 
          // The problem: When binary bytes (like the length header) are interpreted as UTF-8,
          // invalid sequences get replaced with replacement chars (). We can't recover
          // the original binary bytes from a replacement char.
          //
          // Solution: We need to detect and skip replacement chars, then try to parse
          // the message assuming the JSON part is still valid UTF-8.
          
          // Convert string to UTF-8 buffer
          chunkBuffer = Buffer.from(chunk, 'utf8');
          
          // Check if first bytes are replacement chars - this means the 4-byte header was corrupted
          if (chunkBuffer.length >= 3 && chunkBuffer[0] === 0xEF && chunkBuffer[1] === 0xBF && chunkBuffer[2] === 0xBD) {
            // The 4-byte length header was corrupted - we need to reconstruct it
            // Skip the 3-byte replacement char and any following nulls to find JSON start
            let skipBytes = 3;
            while (skipBytes < chunkBuffer.length && chunkBuffer[skipBytes] === 0x00) {
              skipBytes++;
            }
            
            // Find where JSON starts (should be '{' = 0x7B)
            let jsonStart = skipBytes;
            while (jsonStart < chunkBuffer.length && chunkBuffer[jsonStart] !== 0x7B) {
              jsonStart++;
            }
            
            if (jsonStart < chunkBuffer.length) {
              // Found JSON start - calculate length and reconstruct header
              // The JSON body length is from '{' to end of chunk
              const jsonBody = chunkBuffer.slice(jsonStart);
              const jsonLength = jsonBody.length;
              
              // Create new 4-byte length header
              const newHeader = Buffer.allocUnsafe(4);
              newHeader.writeUInt32LE(jsonLength, 0);
              
              // Combine: new header + JSON body
              chunkBuffer = Buffer.concat([newHeader, jsonBody]);
            } else {
              // JSON start not found - might need more data
              // Store the cleaned buffer (after skipping corrupted bytes) for next chunk
              this.buffer = chunkBuffer.slice(skipBytes);
              return; // Wait for more data
            }
          }
        } catch (convertErr) {
          // Skip this chunk if conversion fails
          return;
        }
      } else {
        // Unknown type - try to convert
        chunkBuffer = Buffer.from(chunk);
      }
      
      // Check for UTF-8 replacement character corruption at start of chunk
      // This happens when binary data was interpreted as UTF-8
      if (chunkBuffer.length >= 3 && chunkBuffer[0] === 0xEF && chunkBuffer[1] === 0xBF && chunkBuffer[2] === 0xBD) {
        // Skip the 3-byte UTF-8 replacement character and any following nulls
        let skipBytes = 3;
        while (skipBytes < chunkBuffer.length && chunkBuffer[skipBytes] === 0x00) {
          skipBytes++;
        }
        if (skipBytes < chunkBuffer.length) {
          chunkBuffer = chunkBuffer.slice(skipBytes);
        } else {
          // Entire chunk is corrupted, skip it
          return;
        }
      }
      
      // CRITICAL: Clear buffer if it seems corrupted (more than 10MB accumulated)
      // This handles cases where previous connection left corrupted data
      if (this.buffer.length > 10 * 1024 * 1024) {
        this.buffer = Buffer.alloc(0);
      }
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

      if (messageLength === 0 || messageLength > 10 * 1024 * 1024) {
        // Invalid message (0 length or too large > 10MB)
        // This likely means buffer corruption - check if first bytes are UTF-8 BOM or replacement chars
        
        // Check if buffer starts with UTF-8 BOM (EF BB BF) or replacement char (EF BF BD)
        // If so, skip these corrupted bytes and look for real message
        if (this.buffer.length >= 3) {
          const first3Bytes = this.buffer.readUIntBE(0, 3);
          // UTF-8 BOM: 0xEFBBBF, Replacement char: 0xEFBFBD
          if (first3Bytes === 0xEFBBBF || first3Bytes === 0xEFBFBD || 
              (first3Bytes >>> 8) === 0xEFBFBD || (first3Bytes >>> 16) === 0xEFBFBD) {
            // Skip the 3-byte UTF-8 replacement character and any following nulls
            // Look for the actual message start (should be 4-byte length header)
            let skipBytes = 3;
            // Skip any null bytes after the UTF-8 replacement
            while (skipBytes < this.buffer.length && this.buffer[skipBytes] === 0x00) {
              skipBytes++;
            }
            if (skipBytes < this.buffer.length) {
              this.buffer = this.buffer.slice(skipBytes);
              // Recursively try again with cleaned buffer
              return this.processBuffer();
            } else {
              // All bytes are corrupted, clear buffer
              this.buffer = Buffer.alloc(0);
              return;
            }
          }
        }
        
        // Try to recover by skipping bytes until we find valid length header
        // A valid message length for native messaging is typically < 1MB
        // Look for pattern: [valid 32-bit LE number < 1MB] followed by '{' (JSON start)
        // AND ensure we have enough bytes for the full message
        let foundValid = false;
        for (let offset = 1; offset <= Math.min(this.buffer.length - 8, 10); offset++) {
          if (this.buffer.length < offset + 4) break;
          const testLength = this.buffer.readUInt32LE(offset);
          if (testLength > 0 && testLength < 1024 * 1024) {
            // Check if next byte after length is '{' (JSON object start)
            if (this.buffer.length > offset + 4 && this.buffer[offset + 4] === 0x7B) {
              // CRITICAL: Verify we have enough bytes for the complete message
              const requiredBytes = 4 + testLength; // 4-byte header + message body
              if (this.buffer.length >= offset + requiredBytes) {
                this.buffer = this.buffer.slice(offset);
                foundValid = true;
                // Continue processing with corrected buffer
                return this.processBuffer();
              } else {
                // Valid header found but not enough data - wait for more
                // Shift buffer to start at this offset - we'll get more data later
                this.buffer = this.buffer.slice(offset);
                return; // Wait for more data
              }
            }
          }
        }
        
        if (!foundValid) {
          // No valid message found, clear buffer
          this.buffer = Buffer.alloc(0);
        }
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
