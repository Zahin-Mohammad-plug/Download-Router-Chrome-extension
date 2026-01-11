# Troubleshooting Guide

## "Access to the specified native messaging host is forbidden"

This error occurs when the extension ID in Chrome doesn't match the extension ID in the native messaging manifest.

### Quick Fix

Run the fix script:
```bash
./tests/fix-extension-id.sh
```

This will:
1. Ask for your current extension ID from Chrome
2. Update the manifest automatically
3. Tell you to restart Chrome

### Manual Fix

1. **Get your extension ID:**
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode"
   - Find "Download Router" extension
   - Copy the Extension ID (32-character string)

2. **Update the manifest:**
   ```bash
   ./tests/fix-extension-id.sh
   ```
   Or manually edit:
   ```bash
   nano ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   ```
   Change `allowed_origins` to:
   ```json
   "allowed_origins": [
     "chrome-extension://YOUR_ACTUAL_EXTENSION_ID_HERE/"
   ]
   ```

3. **Restart Chrome completely:**
   - Quit Chrome (Cmd+Q, not just close window)
   - Relaunch Chrome
   - Reload extension in `chrome://extensions/`

4. **Save extension ID for future:**
   ```bash
   cd companion
   echo "YOUR_EXTENSION_ID" > .extension-id
   ```

### Verify Fix

Check the manifest matches your extension:
```bash
./tests/check-extension-id.sh
```

### Why This Happens

- Unpacked extensions get new IDs each time you reload them (in some cases)
- Extension ID in manifest doesn't match the loaded extension
- Chrome caches manifest - needs restart to pick up changes

## Other Common Issues

### Companion app not starting

1. Check logs:
   ```bash
   cat logs/debug/companion-latest.log
   ```

2. Check if Electron is installed:
   ```bash
   cd companion
   npm install
   ```

3. Test manually:
   ```bash
   cd companion
   bash run-companion.sh
   ```

### Folder picker doesn't open

1. Check companion app status in extension options
2. Verify companion app is installed correctly
3. Check logs for errors
4. Make sure Chrome was restarted after installing manifest

### Extension not loading

1. Check manifest.json is valid:
   ```bash
   python3 -m json.tool extension/manifest.json
   ```

2. Check for errors in Chrome DevTools:
   - `chrome://extensions/` → Inspect views: service worker

3. Verify all files exist:
   ```bash
   ls -la extension/
   ```
