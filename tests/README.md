# Test Files

This directory contains test scripts and development utilities.

## Test Scripts

- **test-native-connection.sh** - Verifies native messaging manifest installation
- **test-messaging.js** - Tests companion app native messaging protocol
- **test-native-host.sh** - Simple Python-based native messaging test

## Development Utilities

- **chrome-devtools-mcp-wrapper.sh** - Wrapper for Chrome DevTools MCP
- **launch-chrome-debug.sh** - Launches Chrome with remote debugging
- **setup-dev.sh** - Development environment setup

## Running Tests

### Test Native Messaging Connection
```bash
./tests/test-native-connection.sh
```

### Test Companion App (requires Electron)
```bash
cd companion
node ../tests/test-messaging.js
```

### Test Simple Native Host (Python)
```bash
./tests/test-native-host.sh
```

