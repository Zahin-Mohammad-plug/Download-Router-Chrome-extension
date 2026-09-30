# Release Guide

Two things get released from this repo: the Chrome extension (through the Chrome Web Store) and the optional companion app (GitHub releases). They're versioned separately.

## Extension Release (Chrome Web Store)

Store listing: https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn (ID `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`)

### Steps
1. Bump `version` in `extension/manifest.json`. It must be higher than what's live on the store.
2. Update `CHANGELOG.md` and the version history in `README.md`.
3. Run the manual checks in [TESTING.md](TESTING.md) (rule order, card, 12s cap, migration).
4. Commit, then build the zip:
   ```bash
   STORE_VERSION=<live store version> scripts/package.sh
   # e.g. STORE_VERSION=2.1.3 scripts/package.sh
   ```
   This writes `dist/download-router-<version>.zip` (dev files excluded) and refuses to run if the version isn't higher, a manifest file is missing, or `extension/` has uncommitted changes.
5. Load the unzipped build once as a sanity check.
6. Developer dashboard → Package → Upload new package → the zip. The store takes a zip, not a `.crx`.
7. Update the listing and Privacy practices if anything changed (see [STORE_LISTING.md](STORE_LISTING.md)). New permissions (2.2.0 adds `scripting`) need a justification.
8. Submit for review. Tag the commit (`git tag v<version>`) so the zip can be rebuilt.

### Rollout and rollback
- Staged (percentage) rollout isn't available for extensions under 10,000 users, so every release goes to everyone at once.
- There's no "revert" button. To roll back, check out the last good code, set the version **higher** than the bad one (e.g. 2.2.0 broken → publish the 2.1.3 code as 2.2.1), build with `scripts/package.sh` and submit.
- Existing users update automatically within a few hours of approval.

## Companion App Release (GitHub)

## DMG Location and Filename

### Current Build Location
```
companion/dist/Download Router Companion-1.0.0-arm64.dmg
```

### Recommended Filename for Releases
For GitHub releases, use lowercase with dashes for consistency:
- **macOS**: `download-router-companion-1.0.0-mac-arm64.dmg` (or `-mac-universal.dmg` for universal binary)
- **Windows**: `download-router-companion-1.0.0-windows-x64.exe`

The electron-builder automatically generates names. For releases, you can rename them:
```bash
# After building
cd companion/dist
mv "Download Router Companion-1.0.0-arm64.dmg" "download-router-companion-1.0.0-mac-arm64.dmg"
```

## Adding to GitHub Release

### Steps:
1. Build the companion app: `cd companion && npm run build:mac`
2. Navigate to GitHub → Releases → Create a new release
3. Upload the DMG file from `companion/dist/`
4. Optionally rename to use lowercase filename
5. Add release notes describing what's new

### Release Assets Should Include:
- **macOS**: `download-router-companion-1.0.0-mac-arm64.dmg` (or universal)
- **Windows**: `download-router-companion-1.0.0-windows-x64.exe` (after Windows build)
- **README**: Brief installation instructions
- **Extension ID**: Chrome Web Store ID `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`

## Testing the Built DMG

### macOS Testing:
1. **Mount the DMG:**
   ```bash
   open companion/dist/Download\ Router\ Companion-1.0.0-arm64.dmg
   ```

2. **Install the app:**
   - Drag "Download Router Companion" to Applications
   - Or double-click the app in the DMG to run directly

3. **Install the native messaging manifest:**
   ```bash
   # After installing the app
   cd /Applications/"Download Router Companion.app"/Contents/Resources/app
   # Or use the installation script that should be included
   bash install/install-macos.sh
   ```

4. **Verify installation:**
   - Open Chrome → `chrome://extensions/`
   - Install/load the extension
   - Get your extension ID (32-character string)
   - Run the installer script (it will prompt for extension ID)
   - Restart Chrome
   - Open extension Settings → Companion app row should say "Installed ✓"

5. **Test functionality:**
   - Download card → folder menu → "Other Location…" → native folder picker opens
   - Settings → edit a rule → "Choose…" → native folder picker opens
   - Download a test file with a rule pointing outside Downloads → file ends up there
   - Pick a new folder after the card saved early → file is moved

## Extension ID Handling

### Important: Chrome Web Store Extensions

**Chrome Web Store Extension ID:**
- ✅ **SAME ID for ALL users** - When published to Chrome Web Store, Google assigns ONE permanent extension ID
- ✅ **Permanent and stable** - Never changes across updates or installations
- ✅ **Can be documented** - Once published, you can share the extension ID with users

**How it works:**
1. You publish extension to Chrome Web Store
2. Google assigns a permanent extension ID (visible in developer dashboard)
3. ALL users installing from Web Store get the SAME extension ID
4. You can document this ID for users in your installation instructions

### Development Extension ID

**Development/Unpacked Extension:**
- Different ID per developer/installation
- Depends on the folder it was loaded from (same folder = same ID, even after Reload)
- Each developer needs their own ID

### Current Installer Behavior

The installer now:
1. Checks for `.extension-id` file (for development)
2. If not found, **prompts user** for their extension ID
3. Provides clear instructions on how to find it
4. Saves it for future use
5. Configures the manifest automatically

### For Web Store Users

The extension is published; the Web Store ID is `gbdficmkipoplmkhcdbdlfmjfpgbgjbn` for everyone.
1. Users can enter that ID when the installer prompts
2. Or a future installer can have it pre-configured

**Recommended approach:**
- Keep installer generic (prompts for ID)
- Provide documentation with the Web Store extension ID
- Users copy/paste the ID when installing

## Multiple Users on Same Machine

### How it Works:

**Each User Needs Their Own Installation:**

1. **macOS:**
   - Each user has their own `~/Library/Application Support/Google/Chrome/` directory
   - Each user runs the installer separately
   - Each user's manifest is independent
   - Location: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json`

2. **Windows:**
   - Each user has their own registry (HKCU = Current User)
   - Each user runs the installer separately
   - Each user's manifest is independent
   - Location: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host`

3. **Chrome Profiles:**
   - Each Chrome profile can have different extensions
   - Extension IDs can differ per profile (for unpacked extensions)
   - Each user should use their primary Chrome profile

### Installation Process Per User:

1. User installs the companion app DMG/EXE (can be shared)
2. User runs the installation script (prompts for THEIR extension ID)
3. Manifest is installed in THEIR user directory/registry
4. User restarts Chrome
5. Works independently of other users

### Important Notes:

- ✅ **Companion app binary can be shared** - Same DMG/EXE for all users
- ✅ **Manifest is per-user** - Each user configures their own
- ✅ **Extension ID can differ per user** - Development users may have different IDs
- ✅ **Web Store users share same ID** - But each still needs their own manifest installation

## Release Checklist

Before creating a release:

- [ ] Build both macOS and Windows executables
- [ ] Test DMG installation on clean macOS machine (or VM)
- [ ] Test Windows EXE on Windows machine
- [ ] Verify icons appear correctly in built apps
- [ ] Test installer script prompts for extension ID
- [ ] Installer works with the Web Store ID `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`
- [ ] Create release notes
- [ ] Upload assets to GitHub release
- [ ] Test download and installation from release

## Testing Procedure

### Quick Test (After Building):
```bash
# 1. Mount DMG
open companion/dist/Download\ Router\ Companion-1.0.0-arm64.dmg

# 2. Install app (drag to Applications or run from DMG)

# 3. Run installer
cd /Applications/"Download Router Companion.app"/Contents/Resources/app
bash install/install-macos.sh

# 4. When prompted, enter your extension ID from chrome://extensions/

# 5. Restart Chrome

# 6. Verify:
#    - Extension Settings → Companion app row should show "Installed ✓"
#    - Download card → folder menu → Other Location… → should open folder picker
#    - Download a test file → Should route correctly
```

### Full Integration Test:
1. Fresh Chrome installation (or test profile)
2. Install extension from source or Web Store
3. Get extension ID
4. Install companion app from DMG
5. Run installer with extension ID
6. Test all companion app features
7. Verify logs in `logs/debug/`
