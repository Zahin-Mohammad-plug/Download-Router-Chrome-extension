# Installation Scripts

These scripts install the native messaging host manifest that connects the companion app to the Chrome extension.

## Usage

### macOS
```bash
bash install-macos.sh
```

### Windows (PowerShell)
```powershell
.\install-windows.ps1
```

## What They Do

1. Detect the companion app executable location
2. Prompt for your Chrome extension ID
3. Create/update the native messaging host manifest
4. Configure Chrome to allow communication

## Extension ID

- **Chrome Web Store users**: All users have the SAME extension ID (documented in release notes)
- **Development users**: Each has a different extension ID (found in chrome://extensions/)

## Multiple Users

Each user must run the installer separately - the manifest is per-user:
- macOS: `~/Library/Application Support/Google/Chrome/`
- Windows: Current user registry (HKCU)
