# Download Router Companion - Installation Guide

The Download Router Companion app provides native OS-level file system access, enabling:

- Native folder picker dialogs (macOS Finder, Windows Explorer)
- Absolute path support (save files outside Downloads directory)
- Folder verification and creation
- Post-download file routing

## Prerequisites

- Chrome or Chromium browser
- macOS 10.13+ or Windows 10+
- Node.js 16+ (for building from source)

## Quick Installation

### macOS

1. Download the `Download-Router-Companion-*.dmg` file from [Releases](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/releases)
2. Open the DMG file and drag the app to Applications
3. Run the installation script:
   ```bash
   cd ~/Downloads/Download-Router-Companion-*.dmg
   # After mounting the DMG, run:
   ./install-macos.sh
   ```
4. Restart Chrome
5. Open extension options and verify companion app status shows "Installed"

### Windows

1. Download the `Download-Router-Companion-Setup-*.exe` installer from [Releases](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/releases)
2. Run the installer and follow the setup wizard
3. The installer automatically registers the native messaging host
4. Restart Chrome
5. Open extension options and verify companion app status shows "Installed"

## Manual Installation (Development)

### macOS

```bash
# 1. Clone repository
git clone https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension.git
cd Download-Router-Chrome-extension/companion

# 2. Install dependencies
npm install

# 3. Get your extension ID from chrome://extensions
# Copy the extension ID and save it:
echo "your-extension-id-here" > .extension-id

# 4. Run installation script
bash install/install-macos.sh

# 5. Start companion app (for development)
npm start
```

### Windows

```powershell
# 1. Clone repository
git clone https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension.git
cd Download-Router-Chrome-extension\companion

# 2. Install dependencies
npm install

# 3. Get your extension ID from chrome://extensions
# Copy the extension ID and save it:
"your-extension-id-here" | Out-File -FilePath .extension-id -Encoding utf8

# 4. Run installation script (as Administrator)
powershell -ExecutionPolicy Bypass -File install\install-windows.ps1

# 5. Start companion app (for development)
npm start
```

## Building from Source

### macOS

```bash
cd companion
npm install
npm run build:mac
# Output: dist/Download-Router-Companion-*.dmg
```

### Windows

```bash
cd companion
npm install
npm run build:win
# Output: dist/Download-Router-Companion-Setup-*.exe
```

## Troubleshooting

### Companion app not detected

1. **Check manifest installation:**
   - macOS: Verify `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json` exists
   - Windows: Check Registry at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host`

2. **Verify extension ID:**
   - Open `chrome://extensions`
   - Find your extension ID (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
   - Update manifest file or registry with correct extension ID

3. **Check executable path:**
   - Ensure the path in manifest points to the correct companion app location
   - Path should be absolute (full path, not relative)

4. **Restart Chrome:**
   - Fully quit and restart Chrome (not just reload extension)

### Native picker doesn't open

1. Check Chrome console for errors (F12 → Console)
2. Verify companion app is running (check Activity Monitor / Task Manager)
3. Try restarting the companion app manually

### File moves fail

1. Check companion app logs (run `npm start` in terminal to see logs)
2. Verify destination folder exists and is writable
3. Check file permissions

## Extension ID Configuration

The native messaging manifest must include your extension's ID. To find it:

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Your extension ID is displayed under the extension name
4. Update the manifest file or registry with this ID

**macOS:** Edit `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json`

**Windows:** Edit Registry value at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host`

Change `"allowed_origins"` to:
```json
"allowed_origins": [
  "chrome-extension://YOUR_EXTENSION_ID_HERE/"
]
```

## Uninstallation

### macOS

```bash
# Remove native messaging manifest
rm ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json

# Remove app (if installed via DMG)
rm -rf /Applications/Download\ Router\ Companion.app
```

### Windows

1. Uninstall via Control Panel → Programs and Features
2. Or manually remove Registry entry:
   ```powershell
   Remove-Item "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host" -Recurse
   ```

## Support

For issues or questions:
- [GitHub Issues](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues)
- [Documentation](../README.md)
