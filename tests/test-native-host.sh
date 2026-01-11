#!/bin/bash
# Simple test script to verify Chrome can execute native messaging host

LOG_FILE="/tmp/native-messaging-test.log"

echo "=== Test Script Started ===" >> "$LOG_FILE"
echo "Timestamp: $(date)" >> "$LOG_FILE"
echo "User: $(whoami)" >> "$LOG_FILE"
echo "PATH: $PATH" >> "$LOG_FILE"
echo "PWD: $(pwd)" >> "$LOG_FILE"
echo "Args: $@" >> "$LOG_FILE"
echo "Script: $0" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Read a message from stdin (Chrome sends a 4-byte length prefix + JSON)
# For testing, just echo back a simple response
python3 -c '
import sys
import json
import struct

# Log that we are reading
sys.stderr.write("Python: Reading message...\n")
sys.stderr.flush()

# Read message length (4 bytes)
raw_length = sys.stdin.buffer.read(4)
if len(raw_length) == 0:
    sys.stderr.write("Python: No input\n")
    sys.exit(1)

message_length = struct.unpack("=I", raw_length)[0]
sys.stderr.write(f"Python: Message length: {message_length}\n")
sys.stderr.flush()

# Read the message
message = sys.stdin.buffer.read(message_length).decode("utf-8")
sys.stderr.write(f"Python: Received: {message}\n")
sys.stderr.flush()

# Parse and respond
try:
    request = json.loads(message)
    response = {
        "success": True,
        "type": "test_response",
        "message": "Native messaging is working!",
        "received": request
    }
    
    # Send response
    response_str = json.dumps(response)
    response_bytes = response_str.encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(response_bytes)))
    sys.stdout.buffer.write(response_bytes)
    sys.stdout.buffer.flush()
    
    sys.stderr.write(f"Python: Sent response: {response_str}\n")
    sys.stderr.flush()
except Exception as e:
    sys.stderr.write(f"Python: Error: {e}\n")
    sys.stderr.flush()
' 2>> "$LOG_FILE"

echo "=== Test Script Ended ===" >> "$LOG_FILE"
