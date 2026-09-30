# Chrome Web Store Submission Checklist

Use this before uploading a new version. Listing text, screenshots and privacy answers are in [STORE_LISTING.md](STORE_LISTING.md).

Store page: https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn (ID `gbdficmkipoplmkhcdbdlfmjfpgbgjbn`)

## Pre-Submission Verification

### Manifest
- [ ] `extension/manifest.json` is valid JSON, `manifest_version: 3`
- [ ] `version` is higher than the live store version (2.1.3 → 2.2.0)
- [ ] `description` matches the store short description
- [ ] `minimum_chrome_version: 102`
- [ ] Every referenced file exists (`scripts/package.sh` checks this)

### Files
- [ ] Icons in `extension/icons/` (16, 32, 48, 128)
- [ ] `background.js`, `content.js`, `popup.html/.css/.js`, `options.html/.css/.js`
- [ ] `lib/validation.js`, `lib/native-messaging-client.js`
- [ ] `assets/download-router-sample.pdf` (used by "Try It")
- [ ] No leftovers: no `overlay.*`, no `lib/icons.js`, no large source images (the icon source lives in `docs/design/`)

### Permissions (justifications in STORE_LISTING.md)
- [ ] `downloads`: choose the folder for each download, move/re-download on late changes, show in folder
- [ ] `storage`: rules, settings, recent downloads
- [ ] `notifications`: "Moved to…" / "Couldn't move" messages
- [ ] `nativeMessaging`: optional companion app
- [ ] `scripting`: add the download card to tabs already open at install/update
- [ ] Host `<all_urls>`: the card has to appear on whatever site the download starts from
- [ ] `tabs` and `activeTab` are NOT requested (removed in 2.2.0)
- [ ] Privacy practices tab updated for `scripting` (new in 2.2.0)

### Code
- [ ] No remote code, no `eval` / `new Function` (`scripts/package.sh` checks)
- [ ] Debug logging off by default (`DR_DEBUG`)
- [ ] User-controlled text (file names, sites, folders) escaped before it goes into HTML
- [ ] No hardcoded personal paths or IDs

### Documentation
- [ ] `CHANGELOG.md` and README version history updated
- [ ] `PRIVACY.md` current (linked as the privacy policy URL)

## Testing Checklist

Details in [TESTING.md](TESTING.md).

### Basics
- [ ] Loads without errors (service worker console clean)
- [ ] Fresh install opens Settings with the welcome note; Try It works
- [ ] Popup: Recent, This site + Change, on/off switch, Settings link

### Routing
- [ ] Order: Websites → File names → File types → Everything else, first match wins
- [ ] Subdomains and path rules (`github.com/octocat` beats `github.com`)
- [ ] Single-extension rules beat groups; switched-off groups are skipped
- [ ] Card: countdown (3/5/10s), hover pauses, folder menu, "Always" creates a rule, ✕ cancels
- [ ] Saves by ~12s even while hovering; later change moves / re-downloads the file
- [ ] New Tab / `chrome://` downloads save immediately using rules
- [ ] Upgrade from 2.1.x: rules migrated once, `rulesBackupV1` saved, notice only when routing could change

### Companion (if installed)
- [ ] Settings shows "Installed ✓"
- [ ] Other Location… / Choose… open the native picker
- [ ] Absolute folders and late moves work

## Packaging

```bash
STORE_VERSION=2.1.3 scripts/package.sh
```

- Output: `dist/download-router-<version>.zip`, dev files excluded
- Fails on: version not higher than `STORE_VERSION`, missing manifest files, remote/dynamic code patterns, uncommitted changes in `extension/`
- Upload the zip in the developer dashboard. Don't use "Pack extension" / `.crx`; the store doesn't take those.

## Submission Notes

- Staged rollout isn't available under 10,000 users; the update goes to everyone once approved.
- Rollback = republish the older code with a **higher** version number.
- Tag the submitted commit (`v<version>`).
