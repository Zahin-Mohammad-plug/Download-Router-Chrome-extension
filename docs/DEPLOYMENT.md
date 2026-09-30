# Download Router - Deployment Guide

This guide covers deployment procedures for both development and Chrome Web Store distributions.

## Overview

The Download Router extension has two deployment scenarios:
1. **Development** - Unpacked extension for development and testing
2. **Chrome Web Store** - Zip built by `scripts/package.sh`, uploaded to the developer dashboard

Live listing: https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn (2.1.3 live, about 41 users). Web Store ID: `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`.

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

**Note:** An unpacked extension's ID comes from the folder it was loaded from. Reloading keeps it; loading from a different folder (or another machine) gives a different ID.

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
   - Open the extension's Settings (popup → Settings)
   - The Companion app row should say "Installed ✓"

#### 4. Testing Development Build
- Extension loads without errors
- Popup opens correctly
- Settings page works
- Companion app communication works
- Download routing functions properly

---

## Chrome Web Store Deployment

### Preparing for Web Store Submission

#### 1. Extension ID
The Web Store ID is permanent and the same for every user: `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`. It's visible in the developer dashboard and at `chrome://extensions/` for store installs.

#### 2. Build the Upload Zip
The store takes a zip of the extension folder, not a `.crx`. Build it with:

```bash
STORE_VERSION=2.1.3 scripts/package.sh   # use the version currently live on the store
```

The script:
1. Checks the manifest version is strictly higher than `STORE_VERSION` (skipped with a warning if unset)
2. Checks every file the manifest references exists, and that no JS/HTML uses `eval`, `new Function` or remote `<script src>`
3. Refuses to run if `extension/` has uncommitted changes (`ALLOW_DIRTY=1` to override for local testing)
4. Writes `dist/download-router-<version>.zip`, excluding dotfiles, `*.md`, `*.map`, backups

`dist/` is git-ignored. Unzip it and Load unpacked once as a final check before uploading.

#### 3. Manifest Requirements
Verify `extension/manifest.json`:

- ✅ `manifest_version: 3`
- ✅ Version higher than the store
- ✅ `minimum_chrome_version: 102`
- ✅ Icons provided (16, 32, 48, 128)
- ✅ All referenced files exist

**Permissions Justification** (full wording in [STORE_LISTING.md](STORE_LISTING.md)):
- `downloads` - Core functionality
- `storage` - Save user rules and settings
- `notifications` - "Moved to…" / "Couldn't move" messages
- `nativeMessaging` - Communicate with the optional companion app
- `scripting` - Add the download card to tabs already open at install/update
- `host_permissions: <all_urls>` - Show the download card on any site

`tabs` and `activeTab` were removed in 2.2.0.

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
- **Format:** 32 lowercase letters `a`–`p`
- **Stability:** Tied to the folder it was loaded from; stays the same across Reloads
- **Discovery:** Visible at `chrome://extensions/`

### Web Store Extension ID
- **ID:** `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`
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
If the extension ID changes (e.g. loading unpacked from a different folder, or switching between the unpacked and store versions):
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
1. Bump the version in `extension/manifest.json` and commit
2. `STORE_VERSION=<live version> scripts/package.sh`
3. Developer dashboard → Package → Upload new package → `dist/download-router-<version>.zip`
4. Update listing / privacy practices if needed (see [STORE_LISTING.md](STORE_LISTING.md))
5. Submit for review, tag the commit `v<version>`

**Pre-submission Checklist:** see [WEBSTORE_CHECKLIST.md](WEBSTORE_CHECKLIST.md).

### Rollout and Rollback
- Staged rollout isn't offered for extensions under 10,000 users, so each release goes to all users once approved.
- To roll back, republish the older code with a **higher** version (e.g. 2.2.0 → ship the 2.1.3 code as 2.2.1). Chrome never downgrades an installed extension.
- Version 2.2.0 migrates rules once and keeps the old ones in `chrome.storage.local` (`rulesBackupV1`), so a rollback build could restore them from there.

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

### Web Store Build Testing
1. Build the zip with `scripts/package.sh`
2. Unzip it and Load unpacked in a clean Chrome profile
3. Run the checks in [TESTING.md](TESTING.md), including the upgrade/migration test
4. After the store update is live, install from the store and check the companion with the Web Store ID

### Pre-release Checklist
- [ ] Extension loads without errors
- [ ] All permissions work correctly
- [ ] Companion app installs and connects
- [ ] Download routing works
- [ ] Download card appears, counts down, saves; ✕ cancels
- [ ] Settings page works
- [ ] Popup displays correctly
- [ ] No console errors
- [ ] Logs are clean (no errors)

---

## Troubleshooting Deployment Issues

### Extension Won't Load
- Check extension/manifest.json syntax
- Verify all referenced files exist
- Check Chrome version (the extension requires Chrome 102+)
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
