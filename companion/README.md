# Download Router Companion

Native companion application for the Download Router Chrome extension. Provides OS-level file system access through Chrome's Native Messaging API.

## Features

- Native OS folder picker dialogs (macOS Finder, Windows Explorer)
- Folder verification and creation
- Post-download file moving to absolute paths
- Folder browsing and listing

## Requirements

- Node.js 16+ 
- npm or yarn
- Chrome or Chromium browser

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for all platforms
npm run build:all
```

## Installation

See `../COMPANION_INSTALL.md` for installation instructions.

## Architecture

- `main.js`: Electron main process entry point
- `native-messaging/`: Native Messaging protocol implementation
- `services/`: OS-level file operations
- `manifests/`: Chrome Native Messaging host registration

## Communication Protocol

The companion app communicates with the Chrome extension via Chrome's Native Messaging API using JSON messages over stdin/stdout.

See the extension's `lib/native-messaging-client.js` for message format documentation.
