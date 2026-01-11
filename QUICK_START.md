# Quick Start Guide

## Environment Setup

1. **Check your environment:**
   ```bash
   ./tests/check-environment.sh
   ```
   This will verify all dependencies and show any issues.

2. **Install companion app dependencies (if needed):**
   ```bash
   cd companion
   npm install
   cd ..
   ```

## Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. **Select the `extension/` folder** (NOT the repository root)
5. Note your extension ID (shown below extension name)

## Install Companion App

1. Save your extension ID:
   ```bash
   cd companion
   echo "YOUR_EXTENSION_ID_HERE" > .extension-id
   ```

2. Install companion app:
   ```bash
   bash install/install-macos.sh
   ```

3. **Restart Chrome completely** (quit and relaunch)

## Test Everything

1. **Run complete flow test:**
   ```bash
   ./tests/test-complete-flow.sh
   ```

2. **Check extension in Chrome:**
   - Right-click extension icon → Options
   - Go to Settings tab
   - Check companion app status (should show "Installed")

3. **Test folder picker:**
   - Options → Rules tab
   - Click "+ Add Rule" or edit existing
   - Click "Browse" button
   - Should open native folder picker

## View Logs

All logs are saved to `logs/debug/`

**Quick log viewer:**
```bash
./tests/view-logs.sh
```

**View manually:**
```bash
# Latest companion log
cat logs/debug/companion-latest.log

# Environment check
cat logs/debug/environment-check.log

# All logs
ls -lth logs/debug/
```

## Troubleshooting

If something doesn't work:

1. **Check logs:**
   ```bash
   ./tests/view-logs.sh
   ```

2. **Re-run environment check:**
   ```bash
   ./tests/check-environment.sh
   ```

3. **Check Chrome console:**
   - `chrome://extensions/` → Inspect views: service worker
   - Options page → Right-click → Inspect

4. **Verify companion app:**
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   ```

## Next Steps

See full documentation in `docs/`:
- `docs/TESTING.md` - Comprehensive testing guide
- `docs/DEPLOYMENT.md` - Deployment procedures
- `docs/COMPANION_INSTALL.md` - Detailed companion installation
