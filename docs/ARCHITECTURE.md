# Download Router - Directory Structure

## Root Directory
- Extension files (manifest.json, background.js, content.js, etc.)
- Documentation (README.md, docs/)

## companion/
- **main.js** - Electron app entry point
- **package.json** - Node.js dependencies
- **run-companion.sh** - Native messaging host launcher script
- **native-messaging/** - Native messaging protocol implementation
  - host.js - Protocol handler
  - handlers.js - Message routing
- **services/** - OS-level services
  - folder-picker.js - Native folder picker
  - folder-operations.js - File system operations
  - file-mover.js - Post-download file moving
- **logs/** - Companion app logs
  - companion.log - Runtime logs
- **build/** - Build configuration
- **install/** - Installation scripts

## tests/
- Test scripts for companion app
- Development utilities

## logs/
- Extension and companion app logs
- README.md - Log documentation

## lib/
- Shared JavaScript modules
  - native-messaging-client.js - Chrome extension native messaging client

## icons/
- Extension icons
