# Installation Guide - Download Router Companion

**Status**: Installation process is being improved. The installer may not work smoothly yet. Manual installation instructions below.

## Quick Install

1. **Install the companion app:**
   - Download the DMG from [GitHub Releases](https://github.com/your-repo/releases)
   - Open the DMG and drag "Download Router Companion" to Applications

2. **Connect to Chrome extension:**
   - Open Terminal
   - Run the installer:
     ```bash
     cd "/Applications/Download Router Companion.app/Contents/Resources/app"
     bash install/install-macos.sh
     ```
   - The installer will auto-detect your extension ID or prompt you to enter it
   - Get your extension ID from `chrome://extensions/` (enable Developer mode to see it)

3. **Restart Chrome completely** (quit and relaunch)

4. **Verify connection:**
   - Open Chrome → Right-click extension icon → Options
   - Go to Settings tab
   - Check "Companion App Status" - should show "Installed ✓"

## Manual Installation

If the auto-installer doesn't work, you can manually install:

1. **Get your Extension ID:**
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode"
   - Find "Download Router" extension
   - Copy the 32-character Extension ID

2. **Install native messaging manifest:**
   
   Create file: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json`
   
   With content:
   ```json
   {
     "name": "com.downloadrouter.host",
     "description": "Download Router Companion - Native Messaging Host",
     "path": "/Applications/Download Router Companion.app/Contents/MacOS/Download Router Companion",
     "type": "stdio",
     "allowed_origins": [
       "chrome-extension://YOUR_EXTENSION_ID_HERE/"
     ]
   }
   ```
   
   Replace `YOUR_EXTENSION_ID_HERE` with your actual extension ID.

3. **Restart Chrome**

## Troubleshooting

### "Access to the specified native messaging host is forbidden"

This means the extension ID in the manifest doesn't match your extension ID.

**Fix:**
1. Check your extension ID at `chrome://extensions/`
2. Edit the manifest file (see location above)
3. Update `allowed_origins` with your correct extension ID
4. Restart Chrome completely

### Companion app status shows "Not Installed"

1. Verify manifest file exists at:
   ```
   ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   ```

2. Check manifest content has correct:
   - Executable path
   - Extension ID in `allowed_origins`

3. Restart Chrome completely (not just reload)

### Extension ID Auto-Detection Failed

If auto-detection doesn't work:
- Make sure Chrome has been opened at least once
- Ensure the Download Router extension is installed and enabled
- You can manually enter the extension ID when prompted

## Logs

Companion app logs are stored at:
```
~/Library/Logs/Download Router Companion/companion-main-latest.log
```

Check logs if you encounter issues:
```bash
cat ~/Library/Logs/Download\ Router\ Companion/companion-main-latest.log
```
