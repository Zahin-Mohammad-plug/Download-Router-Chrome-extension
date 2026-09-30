# Download Router - Testing Guide

How to test the Download Router extension (v2.2.0) and the optional companion app.

## Quick Testing Checklist

### Essential Tests (5 minutes)
1. **Reload extension** in `chrome://extensions/`, no errors under "Errors"
2. **Settings** → "Try It" → sample PDF lands in `Downloads/Documents`, card appears
3. **Download from a site** → card shows, counts down, saves to the rule's folder
4. **Popup** → file is under Recent, "This site" line is right
5. **Companion (if installed)**: Settings → Companion app row says "Installed ✓"

---

## Extension Testing

### Load and sanity check
1. `chrome://extensions/` → Developer mode → Load unpacked → `extension/`
2. Service worker: "Inspect views: service worker". No errors on load.
3. On a fresh install, Settings opens with the "You're set up" note and the default file types (Videos, Images, Documents, 3D Files, Archives, Software).
4. Popup opens: Recent, This site, on/off switch, Settings link.
5. Settings is one page: 1 Websites, 2 File names, 3 File types, 4 Everything else, Download card, Companion app. No tabs, no priority fields.

### Rule order (first match wins)
Set up these rules, then download a file for each row. The card's footnote says which rule matched.

| Setup | Download | Expected folder |
|---|---|---|
| Website `github.com` → Code | any file from github.com or a subdomain | Code |
| Website `github.com/octocat` → Forks, plus `github.com` → Code | a file under github.com/octocat/… | Forks (path beats plain domain) |
| File name `invoice` → Invoices | `invoice-2026.pdf` from a site with no website rule | Invoices (beats the Documents type) |
| Website `github.com` → Code, File name `invoice` → Invoices | `invoice.pdf` from github.com | Code (websites beat names) |
| `.zip files` → Zips, Archives group on | `a.zip` | Zips (single extension beats group) |
| Images group switched off | `a.png` from a site with no rules | Everything else (default folder) |
| File name `invoice,` (trailing comma) | `photo.jpg` | NOT Invoices (empty words are ignored) |
| Default folder `Downloads/Misc` | unmatched file | `Downloads/Misc`, not `Downloads/Downloads/Misc` |

### Download card
- Appears when a download starts; shows file name, size · site, "Save to <folder>", Save with countdown.
- Countdown matches the setting (3/5/10s, default 5s). Hover pauses it ("Paused"), leaving resumes.
- Folder menu: "Folders you use" (checkmark on current), New Folder…, Rename File…, Other Location… (only with companion).
- New Folder…: inline field with autocomplete; Return confirms. Invalid names (`a:b`, `..`) show one red line.
- Rename File…: saves under the new name.
- Changing the folder shows "Always save files from <site> here"; the arrow switches to "all .<ext> files". Tick + Save creates the website / `.ext` rule (check Settings).
- ✕ cancels the download (nothing in the downloads list/folder).
- File names and sites containing HTML (e.g. `<b>x</b>.txt`) display as plain text.

### Chrome's time limit
- Hover over the card and keep hovering: the file is saved at ~12 seconds anyway (Chrome only waits ~15s). Footnote: "Saved in <folder> for now · Save moves it".
- Then pick another folder and Save:
  - **With companion**: file is moved on disk, card says "Moved to <folder>".
  - **Without companion**: the file is downloaded again into the new folder and the first copy is deleted. Popup Recent points to the new location.
  - `blob:` / `data:` downloads or single-use links: card/notification says it couldn't move and where the file is.

### Where the card can't appear
- Start a download from the New Tab page or a `chrome://` page (e.g. drag a link or use `chrome://downloads`): it saves immediately using rules, no card.
- Tabs open before install/update: the card should still appear (the extension adds it to open tabs); reload the page if not.
- Settings → "Show the card before saving" off: every download saves immediately using rules.
- Popup switch off: downloads go to plain Downloads.

### Popup
- Recent: click a row → shows the file in Finder/Explorer. Empty state text when nothing downloaded.
- This site: on a site with a rule shows its folder; Change → folder menu → sets/replaces the website rule. On a non-website tab: "Open a website to set where its downloads go."

### Settings
- Click a row → sheet with match field, folder field (autocomplete; "Choose…" only with companion), Delete / Cancel / Save.
- File type rows have switches; off rows are dimmed and show "Off".
- Validation: bad domains, empty names, folders with `<>:"|?*`, absolute folders without the companion → one red error line, nothing saved.
- Welcome note: Try It downloads the bundled PDF; ✕ hides it for good.

### Upgrade / migration (from 2.1.x)
1. Load the old 2.1.x code in a fresh Chrome profile (e.g. `git worktree add ../dr-old main`, then Load unpacked `../dr-old/extension`), add rules with custom priorities, an "override site rules" group, and "ask when rules tie".
2. Copy the 2.2.0 `extension/` files over `../dr-old/extension` (same folder keeps the same extension ID and storage) and click Reload. Chrome treats that as an update.
3. Check:
   - `chrome.storage.local.get('rulesBackupV1')` in the service worker console has the old rules
   - Priorities are gone from the UI, rules follow the fixed order
   - Settings shows "Rules now follow a simple order" once; ✕ hides it and it doesn't come back
   - A user with only default priorities sees no notice
   - Migration runs only once (`rulesModelVersion: 2` in local storage)

### Without the companion app
- Folder fields reject absolute paths ("Folders outside Downloads need the companion app").
- A rule with an absolute folder synced from another computer (e.g. `/Users/me/Documents/Invoices`) saves to `Downloads/Invoices`.

---

## Automated end-to-end tests (approach)

There's no committed e2e suite yet. The approach that works for this extension:

- **Playwright + Chrome for Testing**: branded Chrome no longer allows `--load-extension`, so use a Chrome for Testing build and launch a persistent context with `--disable-extensions-except=<path>/extension --load-extension=<path>/extension`.
- **Fake sites**: serve test files from a local server and map real-looking hostnames to it with `--host-resolver-rules="MAP github.com 127.0.0.1:<port>, MAP *.github.com 127.0.0.1:<port>"`, so website/subdomain/path rules can be tested without the network.
- **Downloads**: set a temp download directory, trigger downloads from the fake pages, then assert on the file's final path.
- **Card**: it lives in a closed shadow root, so drive it through the page with keyboard/mouse (or read state through the service worker) rather than DOM selectors.
- **Storage/migration**: seed `chrome.storage.sync` / `local` from the service worker (`context.serviceWorkers()`), reload, assert.

Cover at least: the rule-order table above, the 12s cap, late move without companion, card-less routing, and migration.

---

## Companion App Testing

### 1. Installation
```bash
cd companion
bash install/install-macos.sh
```

Check the manifest was created and has your extension ID in `allowed_origins`:
```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.downloadrouter.host.json
```

Test with both the unpacked (development) ID and the Web Store ID (`gbdficmkipoplmkhcdbdlfmjfpgbgjbn`).

### 2. Native messaging connection
```bash
./tests/test-native-connection.sh
cd companion && bash run-companion.sh
```
Check the companion logs for initialization messages and no connection errors.

### 3. Functionality
- **Status**: Settings → Companion app row → "Installed ✓" (restart Chrome after installing)
- **Folder picker**: card → folder menu → Other Location…, and Settings → edit a rule → Choose… → native picker opens; cancelling it is not an error
- **Absolute folders**: rule → `/Users/<you>/Documents/Test` → download → file ends up there
- **Missing folder**: rule → a folder that doesn't exist yet → it's created and the file goes inside it (not saved as a file named after the folder)
- **Late move**: see "Chrome's time limit" above

---

## Chrome Web Store Readiness

### Manifest check
- Version is higher than the store (2.1.3 live)
- Permissions: `downloads`, `storage`, `notifications`, `nativeMessaging`, `scripting`; host `<all_urls>`. No `tabs`, no `activeTab`.
- `minimum_chrome_version: 102`

### Build the zip
```bash
STORE_VERSION=2.1.3 scripts/package.sh
```
It fails if the version isn't higher than the store, a manifest file is missing, remote/dynamic code patterns are found, or `extension/` has uncommitted changes (`ALLOW_DIRTY=1` to override while testing). Output: `dist/download-router-<version>.zip`.

### Test the zip
1. Unzip `dist/download-router-<version>.zip` into a temp folder
2. Remove the dev copy from Chrome, Load unpacked → the temp folder
3. Run the Essential Tests above

The store takes the zip, not a `.crx`.

### Extension IDs
- **Development**: assigned when loading unpacked; tied to the folder path
- **Web Store**: `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`, same for every user
- The companion's native messaging manifest must list whichever ID you're testing

---

## Troubleshooting

### Companion shows "Not installed"
1. Check the manifest exists (path above) and `allowed_origins` has `chrome-extension://YOUR_EXTENSION_ID/`
2. Check the script path in it: `ls -la /path/to/project/companion/run-companion.sh`
3. Run it by hand: `cd companion && bash run-companion.sh`
4. Service worker console: look for native messaging errors
5. Fully quit and reopen Chrome (it caches native messaging hosts)

### Folder picker doesn't open
1. Check the companion status in Settings
2. DevTools on the Settings page / service worker for errors
3. `ps aux | grep electron`
4. Check the companion logs

### File moves fail
1. Companion logs
2. Destination is writable
3. Source file still exists (not deleted/renamed by the user)

### Downloads don't route
1. Popup switch is on
2. Rule is saved and spelled right (Settings)
3. Remember the order: websites → names → types → everything else. The card footnote shows which rule matched.
4. Download wasn't cancelled with ✕

### Card doesn't appear
1. "Show the card before saving" is on
2. Not on New Tab / `chrome://` / Web Store pages
3. Reload the page
4. Page DevTools console for `[Download Router]` errors

---

## Log Files

### Companion app
- **macOS**: `~/Library/Logs/Download Router Companion/`
- **Windows**: `%APPDATA%\Download Router Companion\logs\`
- Test scripts: `logs/debug/`

### Extension
- **Service worker**: `chrome://extensions` → Inspect views: service worker
- **Settings / popup**: right-click → Inspect
- **Card**: DevTools on the page you downloaded from

## Test Scripts

```bash
./tests/check-environment.sh      # dependencies
./tests/test-native-connection.sh # native messaging manifest
./tests/test-complete-flow.sh     # companion end to end
./tests/view-logs.sh              # show logs
cd companion && node ../tests/test-messaging.js  # messaging protocol
```

See `tests/README.md` for more.

## Additional Resources

- [Deployment Guide](DEPLOYMENT.md)
- [Companion Installation](COMPANION_INSTALL.md)
- [Main README](../README.md)
