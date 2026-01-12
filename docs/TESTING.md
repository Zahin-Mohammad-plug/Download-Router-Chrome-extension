# Download Router - Testing Guide

This guide provides comprehensive testing procedures for the Download Router Chrome extension and companion app.

## Quick Testing Checklist

### Essential Tests (5 minutes)
1. ✅ **Reload extension** in `chrome://extensions/`
2. ✅ **Open Options** → Settings tab → Check companion status
3. ✅ **Open Options** → Rules tab → Click Browse → Should open folder picker
4. ✅ **Check logs**: `cat companion/logs/companion.log`

---

## Testing Steps

### Step 1: Reload Extension
1. Open Chrome → `chrome://extensions/`
2. Find "Download Router" extension
3. Click **Reload** button
4. Check for errors in "Errors" button (should be none)

### Step 2: Check Companion App Connection
1. Right-click extension icon → **Options**
2. Click **Settings** tab
3. Look for companion app status:
   - ✅ **Green box** = Connected
   - ⚠️ **Yellow box** = Not installed (check logs)

### Step 3: Test Folder Picker
1. In Options → **Rules** tab
2. Click **+ Add Rule** or **Edit** on existing rule
3. Click **Browse** button next to Folder field
4. Should open **native OS folder picker** (macOS Finder, Windows Explorer, or Linux dialog)
5. Select a folder (platform-appropriate path)
6. Click **Save Changes**

### Step 4: Test Download Routing
1. Go to https://github.com
2. Download any file (e.g., icon.png)
3. Extension overlay should appear
4. File should route to configured folder

### Step 5: Check Logs
```bash
# All logs are in logs/debug directory

# View latest companion log
cat logs/debug/companion-latest.log

# View all logs
ls -lth logs/debug/

# Watch companion log in real-time
tail -f logs/debug/companion-latest.log

# View environment check log
cat logs/debug/environment-check.log

# View test flow log
cat logs/debug/test-complete-flow-latest.log
```

---

## Component Testing

### Companion App Testing

#### 1. Installation Test
**Verify `companion/install/install-macos.sh` works:**

```bash
cd companion
bash install/install-macos.sh
```

**Check manifest file created:**
```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
```

**Verify extension ID is correctly set:**
- Check the manifest file contains your extension ID in `allowed_origins`
- Extension ID can be found at `chrome://extensions/`

**Test with both development and Web Store extension IDs:**
- Development: Use the unpacked extension ID
- Web Store: Use the published extension ID (if available)

#### 2. Native Messaging Connection
**Run connection test:**
```bash
./tests/test-native-connection.sh
```

**Test companion app starts:**
```bash
cd companion
bash run-companion.sh
```

**Verify native messaging host can be reached:**
- Check companion app logs for initialization messages
- Verify no connection errors

#### 3. Functionality Tests

**Folder Picker:**
1. Open extension options → Rules → Browse button
2. Verify native macOS folder picker opens
3. Select a folder
4. Verify selected path is saved in rule editor

**Folder Operations:**
```bash
# Test folder verification (exists)
# Use test script or manual test in extension

# Test folder verification (doesn't exist)
# Test with non-existent folder path

# Test folder creation
# Create a rule with non-existent folder path
# Extension should create folder automatically
```

**File Moving:**
1. Download a test file from any website
2. Verify it routes to configured folder
3. Check file is moved correctly:
   ```bash
   ls -la /path/to/configured/folder
   ```

### Extension Testing

#### 1. Basic Functionality
**Load extension in Chrome:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

**Verify no errors:**
- Check service worker console: Click "Inspect views: service worker"
- Should see no error messages
- Should see initialization messages

**Test popup:**
1. Click extension icon in toolbar
2. Popup should open without errors
3. Should display extension status and statistics

**Test options page:**
1. Right-click extension icon → Options
2. Options page should load without errors
3. All tabs should be accessible (Rules, Groups, Settings, Folders)

#### 2. Download Routing

**Create Domain Rule:**
1. Go to Options → Rules tab
2. Click "+ Add Rule"
3. Enter domain: `github.com`
4. Enter folder: `Code/GitHub`
5. Click "Save Changes"

**Create File Type Rule:**
1. Go to Options → Groups tab
2. Create or edit a group (e.g., "Documents")
3. Add extensions: `pdf`, `doc`, `docx`
4. Set folder: `Documents`
5. Save changes

**Test Download:**
1. Visit https://github.com
2. Download any file
3. Verify overlay appears in bottom-right corner
4. Verify file routes to configured folder
5. Test overlay countdown (5 seconds auto-save)
6. Test overlay buttons (Edit Rules, Change Location)

#### 3. Communication Testing

**Background ↔ Popup/Options:**
1. Open popup
2. Toggle extension enable/disable
3. Verify background script receives message
4. Open options page
5. Make configuration changes
6. Verify background script receives and processes updates

**Content ↔ Background:**
1. Trigger a download
2. Verify content script sends download info to background
3. Verify overlay is displayed by content script
4. Test overlay actions (save, change location, edit rules)
5. Verify messages are sent to background correctly

**Native Messaging:**
1. Install companion app
2. Open options → Settings tab
3. Verify companion status shows "Installed"
4. Click Browse button in Rules tab
5. Verify folder picker opens (companion app)
6. Select folder and verify path is returned

### Chrome Web Store Readiness

#### 1. Manifest Validation
**Verify extension/manifest.json is valid:**
- All required fields present
- Version number is valid
- All permissions are justified
- All referenced files exist

**Check permissions:**
- `downloads` - Required for download routing
- `storage` - Required for rules storage
- `notifications` - Required for fallback notifications
- `activeTab` - Required for overlay injection
- `nativeMessaging` - Required for companion app
- `host_permissions` - Required for overlay injection

**Verify all referenced files exist:**
```bash
# Check all files referenced in manifest
ls -la extension/background.js extension/content.js extension/popup.html extension/popup.js extension/options.html extension/options.js extension/overlay.css
ls -la extension/icons/icon*.png
```

#### 2. Pack Extension
```bash
# In Chrome:
# 1. Go to chrome://extensions/
# 2. Click "Pack extension"
# 3. Select the extension/ directory
# 4. Pack the extension
```

**Test packed extension:**
1. Remove unpacked extension from Chrome
2. Load the packed `.crx` file (or unpack and load)
3. Verify all functionality works
4. Test companion app with packed extension ID

#### 3. Extension ID Handling

**Development Extension ID:**
- Generated automatically when loading unpacked extension
- Changes if you reload the extension
- Find at `chrome://extensions/`

**Web Store Extension ID:**
- Assigned by Chrome Web Store when published
- Permanent and stable
- Users need this ID for companion app installation

**Testing with different extension IDs:**
1. Test companion app installation with development ID
2. Test companion app installation with a dummy Web Store ID format
3. Verify manifest allows both formats

---

## Troubleshooting

### Companion App Issues

#### Companion App Shows "Not Installed"

1. **Check manifest exists:**
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   ```

2. **Check script path:**
   ```bash
   ls -la /Users/Shared/Github-repo/companion/run-companion.sh
   ```

3. **Test script manually:**
   ```bash
   cd companion
   bash run-companion.sh
   ```

4. **Check Chrome console:**
   - `chrome://extensions/` → Inspect views: service worker
   - Look for native messaging errors

5. **Verify extension ID in manifest:**
   - Manifest must contain your extension ID in `allowed_origins`
   - Format: `chrome-extension://YOUR_EXTENSION_ID/`

6. **Restart Chrome:**
   - Fully quit and restart Chrome (not just reload extension)
   - Chrome caches native messaging hosts on startup

#### Folder Picker Doesn't Open

1. Check companion app status in Settings tab
2. Open Chrome DevTools console (Options page → F12)
3. Check for errors when clicking Browse
4. Verify companion app is running:
   ```bash
   ps aux | grep electron
   ```
5. Check companion app logs:
   ```bash
   tail -f companion/logs/companion.log
   ```

#### File Moves Fail

1. Check companion app logs:
   ```bash
   cat companion/logs/companion.log
   ```
2. Verify destination folder exists and is writable
3. Check file permissions
4. Verify source file exists before moving

### Extension Issues

#### Extension Not Loading

1. Check for syntax errors in extension/manifest.json
2. Verify all referenced files exist
3. Check service worker console for errors
4. Verify Chrome version supports Manifest V3

#### Downloads Don't Route

1. Verify rule is saved (check Rules tab)
2. Check rule matches domain/file type
3. Verify target folder exists or can be created
4. Check extension is enabled (popup toggle)
5. Verify download wasn't manually cancelled

#### Overlay Not Appearing

1. Check if website blocks content scripts
2. Look for fallback notifications in Chrome
3. Verify extension permissions
4. Check content script console for errors
5. Test on different websites

#### Rules Not Saving

1. Check Chrome storage quota
2. Verify background script is running
3. Check service worker console for errors
4. Try reloading extension

---

## Expected Behavior

### ✅ Working Correctly:
- Options page shows companion app status
- Browse button opens native folder picker
- Selected folder path appears in rule editor
- Downloads route to configured folders
- Overlay appears on downloads
- Files move to absolute paths (if companion app connected)
- Countdown timer works and auto-saves after timeout
- All overlay buttons function correctly

### ⚠️ Known Limitations:
- Companion app connection requires Chrome restart after installation
- Folder picker falls back to modal if companion not available
- Relative paths work as fallback without companion app
- Extension ID changes when reloading unpacked extension in development

---

## File Locations

- **Extension**: `/Users/Shared/Github-repo/extension/`
- **Companion App**: `/Users/Shared/Github-repo/companion/`
- **Logs**: `/Users/Shared/Github-repo/logs/debug/`
- **Tests**: `/Users/Shared/Github-repo/tests/`
- **Manifest**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json`
- **Documentation**: `/Users/Shared/Github-repo/docs/`

---

## Test Scripts

### Manual Test Scripts

**Test Native Messaging Connection:**
```bash
./tests/test-native-connection.sh
```

**Test Companion App (requires Electron):**
```bash
cd companion
node ../tests/test-messaging.js
```

**Test Simple Native Host (Python):**
```bash
./tests/test-native-host.sh
```

See `tests/README.md` for more details on test scripts.

---

## Log Files

### Companion App Logs
- `companion/logs/companion.log` - Companion app runtime logs

### Extension Logs
Check Chrome DevTools console for extension errors:
- **Service Worker**: `chrome://extensions` → Inspect views: service worker
- **Options Page**: Right-click extension → Options → DevTools
- **Content Scripts**: Chrome DevTools on any webpage

### Native Messaging Logs
Native messaging host initialization and errors are logged to `companion/logs/companion.log`

## Additional Resources

- [Deployment Guide](DEPLOYMENT.md)
- [Companion Installation](COMPANION_INSTALL.md)
- [Main README](../README.md)
