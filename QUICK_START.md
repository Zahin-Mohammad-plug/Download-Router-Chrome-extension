# Quick Start Guide

This gets the extension running from source. The companion app is optional; skip that part if your folders are all inside Downloads.

## Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. **Select the `extension/` folder** (NOT the repository root)
5. A Settings page opens. Click **Try It** in the "You're set up" note: a sample PDF downloads, the download card appears on the page, and the file lands in `Downloads/Documents`
6. Note your extension ID (shown below the extension name) if you plan to install the companion app

## Try the Basics

1. Open any website and download a file. The card shows where it's going and saves after 5 seconds.
2. Click the folder on the card to pick another one, tick **Always save files from <site> here**, then **Save**. Download again: it goes straight to the new folder.
3. Click the toolbar icon: the file is under **Recent** (click it to show it in Finder), and **This site** shows the rule you just made.
4. Open **Settings** from the popup. The rule is under **1 Websites**. Click it to edit or delete it.

## Install Companion App (optional)

Needed only to save outside Downloads. It's a manual install for now; full steps are in `docs/COMPANION_INSTALL.md`.

1. Check your environment:
   ```bash
   ./tests/check-environment.sh
   ```

2. Install dependencies and save your extension ID:
   ```bash
   cd companion
   npm install
   echo "YOUR_EXTENSION_ID_HERE" > .extension-id
   ```

3. Register it with Chrome:
   ```bash
   # macOS
   bash install/install-macos.sh

   # Windows (PowerShell)
   .\install\install-windows.ps1
   ```

4. **Restart Chrome completely** (quit and relaunch)

5. Check it:
   - Settings → **Companion app** row should say "Installed ✓"
   - On the download card, the folder menu now has **Other Location…** (native folder picker)
   - In Settings, editing a rule shows a **Choose…** button next to the folder

6. Optional end-to-end companion test:
   ```bash
   ./tests/test-complete-flow.sh
   ```

## View Logs

Companion and test-script logs are saved to `logs/debug/`. Extension logs are in Chrome DevTools (see Troubleshooting).

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
   - Settings page → Right-click → Inspect
   - Download card: DevTools on the page where you downloaded

4. **Verify companion app:**
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
   
   # Windows (PowerShell)
   reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.downloadrouter.host"
   ```

## Next Steps

See full documentation in `docs/`:
- `docs/TESTING.md` - Comprehensive testing guide
- `docs/DEPLOYMENT.md` - Deployment procedures
- `docs/COMPANION_INSTALL.md` - Detailed companion installation
