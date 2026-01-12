# Download Router - Deployment Guide

This guide covers deployment procedures for both development and Chrome Web Store distributions.

## Overview

The Download Router extension has two deployment scenarios:
1. **Development** - Unpacked extension for development and testing
2. **Chrome Web Store** - Packed extension for distribution

Key differences:
- Extension IDs differ between development and Web Store
- Companion app must be configured with the correct extension ID
- Manifest requirements are identical for both scenarios

---

## Development Deployment

### Setting Up Development Environment

#### 1. Load Unpacked Extension
1. Clone the repository:
   ```bash
   git clone https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension.git
   cd Download-Router-Chrome-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked"

5. Select the `extension/` directory inside the repository

6. The extension will load and Chrome will assign a temporary extension ID

#### 2. Get Development Extension ID
1. In `chrome://extensions/`, find "Download Router"
2. The extension ID is displayed below the extension name (32-character string)
3. Copy this ID for companion app installation

**Note:** The extension ID changes when you:
- Reload the extension
- Remove and re-add the extension
- Clear browser data

#### 3. Install Companion App (Development)
1. Navigate to companion directory:
   ```bash
   cd companion
   ```

2. Save your extension ID:
   ```bash
   echo "YOUR_EXTENSION_ID_HERE" > .extension-id
   ```
   Replace `YOUR_EXTENSION_ID_HERE` with the ID from step 2.

3. Install dependencies (if not already done):
   ```bash
   npm install
   ```

4. Run installation script:
   ```bash
   bash install/install-macos.sh
   ```
   (or `install/install-windows.ps1` on Windows)

5. Restart Chrome completely (quit and relaunch)

6. Verify installation:
   - Open extension options
   - Go to Settings tab
   - Check companion app status (should show "Installed")

#### 4. Testing Development Build
- Extension loads without errors
- Popup opens correctly
- Options page works
- Companion app communication works
- Download routing functions properly

---

## Chrome Web Store Deployment

### Preparing for Web Store Submission

#### 1. Extension ID Discovery
**Important:** Web Store extensions get a **permanent extension ID** assigned by Chrome Web Store when first published.

**Before Publishing:**
- You cannot know the extension ID in advance
- Use a placeholder or prompt users to find their ID after installation

**After Publishing:**
- Extension ID is displayed in Chrome Web Store developer dashboard
- Extension ID is visible at `chrome://extensions/` (when installed from Web Store)
- Extension ID is **permanent** and **stable**

#### 2. Pack Extension
You can pack the extension locally to test, but the Web Store uses its own packaging:

**Local Packing (for testing only):**
1. Go to `chrome://extensions/`
2. Click "Pack extension"
3. Select the `extension/` directory
4. Leave private key empty (for first-time packing)
5. Click "Pack Extension"
6. Test the packed extension locally

**Note:** Packed extensions from local packing won't work for Web Store submission. You must upload the source code to Web Store.

#### 3. Manifest Requirements
Verify `extension/manifest.json` meets Web Store requirements:

- ✅ `manifest_version: 3` (required)
- ✅ All permissions justified
- ✅ All referenced files exist
- ✅ Icons provided (16, 32, 48, 128)
- ✅ Valid version number
- ✅ All referenced files exist

**Permissions Justification:**
- `downloads` - Core functionality
- `storage` - Save user rules and settings
- `notifications` - Fallback notification system
- `activeTab` - Inject overlay into pages
- `nativeMessaging` - Communicate with companion app
- `host_permissions: <all_urls>` - Overlay injection on any site

#### 4. Prepare Companion App for Web Store Users

**Companion App Installation for Web Store Users:**

Users installing from Web Store need to:
1. Install the extension from Chrome Web Store
2. Get their extension ID from `chrome://extensions/`
3. Download and install companion app
4. Configure companion app with their extension ID

**Installation Script Behavior:**
- Installation scripts check for `.extension-id` file
- If not found, they prompt user for extension ID
- Scripts validate extension ID format
- Manifest is created with the provided extension ID

**Alternative: Dynamic Extension ID Detection**
For better UX, consider:
- Creating a helper script that reads extension ID from Chrome
- Providing clear instructions in companion app installer
- Auto-detection in future versions (requires Chrome API access)

---

## Extension ID Handling

### Development Extension ID
- **Format:** 32-character lowercase hexadecimal string
- **Example:** `abcdefghijklmnopqrstuvwxyz123456`
- **Stability:** Changes when extension is reloaded/removed
- **Discovery:** Visible at `chrome://extensions/`

### Web Store Extension ID
- **Format:** Same 32-character format
- **Example:** `abcdefghijklmnopqrstuvwxyz123456`
- **Stability:** Permanent, never changes
- **Discovery:** Visible at `chrome://extensions/` or Web Store dashboard

### Manifest Configuration
The native messaging host manifest must include the extension ID:

**macOS:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json`
```json
{
  "name": "com.downloadrouter.host",
  "description": "Download Router Companion",
  "path": "/path/to/run-companion.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID_HERE/"
  ]
}
```

**Windows:** Registry at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host`

### Extension ID Updates
If extension ID changes (development reload, Web Store update):
1. Update `.extension-id` file in companion directory
2. Re-run installation script
3. Restart Chrome

---

## Build Procedures

### Development Build
No build step required:
- Just load unpacked extension in Chrome
- Make code changes
- Reload extension to test

### Web Store Build
Web Store handles building:
1. Upload source code to Chrome Web Store
2. Web Store validates and builds
3. Extension is packaged automatically
4. Review process begins

**Pre-submission Checklist:**
- [ ] All code is production-ready
- [ ] No debug console.log statements
- [ ] All files referenced in manifest exist
- [ ] Icons are present and correct
- [ ] Version number is incremented
- [ ] README and documentation are updated

---

## Companion App Registration

### Registration Process

**Development:**
1. Install companion app dependencies: `npm install`
2. Save extension ID: `echo "EXT_ID" > .extension-id`
3. Run installer: `bash install/install-macos.sh`
4. Manifest created automatically with extension ID

**Web Store:**
1. User installs extension from Web Store
2. User downloads companion app installer
3. User gets extension ID from `chrome://extensions/`
4. User runs installer with extension ID
5. Manifest created with Web Store extension ID

### Manifest Location

**macOS:**
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
```

**Windows:**
```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host
```

### Verification
```bash
# macOS - Check manifest exists
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json

# macOS - Check extension ID in manifest
grep "chrome-extension://" ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json

# Windows - Check registry
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host"
```

---

## Testing Deployment

### Development Testing
1. Load unpacked extension
2. Install companion app with development extension ID
3. Test all functionality
4. Verify companion app communication
5. Test download routing
6. Check logs for errors

### Web Store Testing
1. Pack extension locally (or use Web Store test channel)
2. Install packed extension
3. Get extension ID from packed installation
4. Install companion app with packed extension ID
5. Test all functionality
6. Verify behavior matches development version

### Pre-release Checklist
- [ ] Extension loads without errors
- [ ] All permissions work correctly
- [ ] Companion app installs and connects
- [ ] Download routing works
- [ ] Overlay system functions
- [ ] Options page works
- [ ] Popup displays correctly
- [ ] No console errors
- [ ] Logs are clean (no errors)

---

## Troubleshooting Deployment Issues

### Extension Won't Load
- Check extension/manifest.json syntax
- Verify all referenced files exist
- Check Chrome version (Manifest V3 requires Chrome 88+)
- Review service worker console for errors

### Companion App Not Connecting
- Verify extension ID is correct in manifest
- Check manifest file exists at correct location
- Restart Chrome completely
- Verify companion app executable path is correct
- Check companion app logs

### Extension ID Mismatch
- Development: Re-save extension ID and reinstall companion app
- Web Store: User must use the ID from their installed extension
- Update manifest manually if needed

### Permission Denied
- macOS: Check file permissions on run-companion.sh
- Windows: Run installer as Administrator
- Verify executable paths are correct

---

## Additional Resources

- [Testing Guide](TESTING.md)
- [Companion Installation](COMPANION_INSTALL.md)
- [Main README](../README.md)
- [Chrome Web Store Documentation](https://developer.chrome.com/docs/webstore/)
