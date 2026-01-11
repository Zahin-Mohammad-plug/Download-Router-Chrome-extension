# Companion App Testing Guide (Phase 4.1.1)

This guide covers testing the companion app independently from the Chrome extension.

## Test Scripts

### 1. Installation Test (`test-companion-install.sh`)
Tests Phase 4.1.1.1:
- ✅ Verifies installation script exists and is executable
- ✅ Checks manifest template is valid
- ✅ Verifies installed manifest in Chrome directory
- ✅ Validates script paths and extension ID
- ✅ Checks dependencies (Electron, node_modules)

**Run:**
```bash
./tests/test-companion-install.sh
```

### 2. Native Messaging Connection Test (`test-companion-messaging.sh`)
Tests Phase 4.1.1.2:
- ✅ Verifies manifest is properly installed
- ✅ Tests companion app can start
- ✅ Checks log file creation

**Run:**
```bash
./tests/test-companion-messaging.sh
```

### 3. Functionality Test (`test-companion-functions.sh`)
Tests Phase 4.1.1.3:
- ✅ Version check (getVersion)
- ✅ Folder verification (verifyFolder)
- ✅ Folder picker (pickFolder) - requires user interaction
- Uses `test-messaging.js` to communicate via native messaging protocol

**Run:**
```bash
./tests/test-companion-functions.sh
```

### 4. Run All Tests (`test-companion-all.sh`)
Runs all three tests in sequence.

**Run:**
```bash
./tests/test-companion-all.sh
```

## Expected Results

### Installation Test
- ✅ All files present
- ✅ Manifest valid and installed
- ✅ Extension ID set (not placeholder)
- ✅ Scripts executable

### Native Messaging Connection Test
- ✅ Manifest found and valid
- ✅ Companion app can start
- ✅ Log files created

### Functionality Test
- ✅ Version check succeeds
- ✅ Folder verification works
- ✅ Folder picker opens (manual verification)
- ✅ All responses received correctly

## Logs

All test logs are saved to `logs/debug/`:
- `test-companion-install-*.log`
- `test-companion-messaging-*.log`
- `test-companion-functions-*.log`
- `test-companion-all-*.log`

Latest logs have `-latest.log` symlinks for easy access.

## Troubleshooting

If tests fail:

1. **Check logs:**
   ```bash
   cat logs/debug/test-companion-install-latest.log
   ```

2. **Re-run environment check:**
   ```bash
   ./tests/check-environment.sh
   ```

3. **Verify installation:**
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   ```

4. **Reinstall if needed:**
   ```bash
   cd companion
   echo "YOUR_EXTENSION_ID" > .extension-id
   bash install/install-macos.sh
   ```
