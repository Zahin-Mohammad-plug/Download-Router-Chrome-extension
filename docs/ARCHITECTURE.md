# Download Router - Directory Structure

## Root Directory
- Repository root with main README.md
- Documentation in `docs/` directory

## extension/
- **manifest.json** - Extension configuration
- **background.js** - Service worker & routing logic
- **content.js** - Shadow DOM overlay system
- **popup.html/js/css** - Extension popup interface
- **options.html/js/css** - Settings & configuration
- **overlay.css** - Overlay styles
- **lib/** - Shared libraries
  - native-messaging-client.js
- **icons/** - Extension icons (16, 32, 48, 128)

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

## docs/
- ARCHITECTURE.md - This file
- COMPANION_INSTALL.md - Companion app installation guide
- DEPLOYMENT.md - Deployment procedures
- TESTING.md - Testing guide
- WEBSTORE_CHECKLIST.md - Web Store submission checklist
