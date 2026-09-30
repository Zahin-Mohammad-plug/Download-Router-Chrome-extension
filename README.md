# Download Router

A Chrome extension that saves your downloads into different folders based on rules you set. Instead of everything landing in one big Downloads pile, files get sorted by the website they came from, a word in the file name, or the file type.

## What it does

You set things up like "anything from github.com goes to Code" or "all .stl files go to 3D Printing". When you download something, a small card pops up on the page showing where the file is going. Leave it alone and it saves there after a few seconds. Want it somewhere else? Pick another folder on the card, and tick "Always" if you want that to stick next time.

## Status

- **Extension**: v2.2.0, works on macOS and Windows (Chrome 102+)
- **Chrome Web Store**: [Download Router](https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn) (the store has 2.1.3 until 2.2.0 goes through review)
- **Companion App**: v1.0.0, optional. Tested on macOS; Windows builds exist but still need testing on a real Windows machine

## Installation

### From the Chrome Web Store

Install it from the [store page](https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn). After install a settings page opens with a "Try It" button that downloads a small sample PDF so you can see the card in action.

### From source

1. Clone or download this repo
2. Open Chrome → `chrome://extensions/`
3. Turn on "Developer mode" (top right)
4. Click "Load unpacked" and pick the `extension/` folder

That's it. Everything works without the companion app, as long as your folders live inside Downloads.

### Companion app (optional)

Chrome only lets extensions save inside your Downloads folder. The companion app is a small helper that gets around that:

- Save to any folder on your computer (other drives, Documents, a NAS…)
- Native folder picker ("Other Location…" on the card, "Choose…" in Settings)
- Moves files on disk when you change your mind after a file was already saved

Right now there's no one-click installer. It's a manual install: build or run it from `companion/`, then register it with Chrome using your extension ID. Steps are in [docs/COMPANION_INSTALL.md](docs/COMPANION_INSTALL.md). Settings shows "Installed ✓" once Chrome can talk to it.

## How it works

### Rules

Rules are checked in a fixed order, top to bottom. The first one that matches wins:

1. **Websites**: where the file came from. `github.com` also covers its subdomains (`gist.github.com`, etc.). A rule with a path like `github.com/octocat` beats plain `github.com`.
2. **File names**: a word in the file name, like "invoice". You can list a few words separated by commas.
3. **File types**: single-extension rules (".zip files") come first, then groups like Images or Documents. Groups can be switched on and off.
4. **Everything else**: the default folder, inside Downloads.

That's the whole model. No priority numbers, no "override" switches, no tie-breaking settings. If a website rule and a file type both match, the website wins, every time.

Coming from an older version? On update your rules get moved over to this order once. Your old rules are backed up locally first, and if the new order could send some of your files somewhere different, Settings shows a one-time note explaining the change.

### The download card

When a download starts, a small card shows up on the page with:

- The file name, size and site
- **Save to [folder]**: click the folder to open a menu with the folders you use, **New Folder…**, **Rename File…**, and **Other Location…** (companion app only)
- An **"Always save files from github.com here"** checkbox when you pick a different folder. The little arrow switches it to "all .zip files" instead. Ticking it creates the rule for you.
- A **Save** button with a countdown (3, 5 or 10 seconds, 5 by default)
- A line saying why it's going there ("Your github.com rule", "Matched file type · Archives", "No rule matched")

Hovering over the card pauses the countdown, so does having the menu open or typing. The ✕ cancels the download.

A couple of Chrome limits worth knowing:

- Chrome only waits about 15 seconds for an extension to pick a location, so the card saves at 12 seconds no matter what (even if you're still hovering). If you pick a new place after that, the file gets moved there. With the companion app it's a real move on disk. Without it, the file is downloaded again into the new folder and the first copy is deleted. That second download isn't possible for `blob:`/`data:` downloads or single-use links, so those stay where they were saved and the card tells you where.
- The card can't appear on the New Tab page or `chrome://` pages. Downloads started there save right away using your rules.

### Popup

Click the toolbar icon to see:

- **Recent**: your last downloads. Click one to show it in Finder (or Explorer).
- **This site**: where downloads from the current site go, with a **Change** button that sets a website rule.
- An on/off switch. When it's off, downloads go to Downloads like normal.
- A link to Settings.

### Settings

One page, no tabs. Open it from the popup or by right-clicking the icon → Options.

- The four numbered sections in the order they're checked: Websites, File names, File types, Everything else. Click a row to edit or delete it, or use the Add button in each section.
- **Download card**: show the card before saving (off = save right away), and how long to wait (3s / 5s / 10s).
- **Companion app**: whether it's installed, with a link to the install guide if not.

### Without the companion app

Folders are always inside Downloads. If you sync your settings from another computer that has the companion app and a rule points to something like `/Users/me/Documents/Invoices`, this computer saves to a folder with the same name inside Downloads (`Downloads/Invoices`) instead.

## Default file types

New installs start with these file type groups:

- **Videos** → `Videos/`: mp4, mov, mkv, avi, wmv, flv, webm
- **Images** → `Images/`: jpg, jpeg, png, gif, bmp, svg, webp
- **Documents** → `Documents/`: pdf, doc, docx, txt, rtf, odt
- **3D Files** → `3D Files/`: stl, obj, 3mf, step, stp, ply
- **Archives** → `Archives/`: zip, rar, 7z, tar, gz
- **Software** → `Software/`: exe, msi, dmg, deb, rpm, pkg

Change the folder, switch any of them off, or add your own.

## Technical stuff

### Architecture

- Manifest V3, service worker (`background.js`) picks the folder using `chrome.downloads.onDeterminingFilename`
- The card is a content script in a closed Shadow DOM, so it doesn't mess with the site's styles (and vice versa)
- Rules and settings live in `chrome.storage.sync`; recent downloads and the one-time notices live in `chrome.storage.local`
- Companion app is Electron, talks to the extension over Chrome native messaging

Permissions: `downloads`, `storage`, `notifications` (the "Moved to…" / "Couldn't move" messages), `nativeMessaging` (companion app), `scripting` (adds the card to tabs that were already open when the extension was installed or updated), and access to all sites so the card can show on whatever page you download from.

### Companion app structure

Same code for macOS, Windows and Linux. Platform-specific bits (folder pickers) check `process.platform`:

- macOS: osascript for dialogs
- Windows: PowerShell for dialogs
- Linux: zenity/kdialog for dialogs

File operations (move, verify, create folders) use Node's `fs`, which is already cross-platform.

### File structure

```
extension/             # Chrome extension (load this in Chrome)
  ├── manifest.json
  ├── background.js    # Service worker, routing logic, migration
  ├── content.js       # Download card
  ├── popup.*          # Toolbar popup
  ├── options.*        # Settings page
  ├── lib/             # validation.js, native-messaging-client.js
  └── assets/          # Sample PDF for "Try It"

companion/             # Electron companion app (optional)
docs/                  # Docs (design, testing, deployment, store listing)
scripts/package.sh     # Builds the Web Store zip
tests/                 # Companion/native messaging test scripts
```

## Development

### Extension

1. Load `extension/` in Chrome (Developer mode → Load unpacked)
2. Make changes
3. Hit reload on `chrome://extensions/`
4. Test

No build step. Use DevTools for debugging (service worker: "Inspect views" on the extensions page).

### Packaging for the store

```bash
STORE_VERSION=2.1.3 scripts/package.sh
```

This checks the manifest version is higher than what's live, checks every file the manifest references exists, refuses to run with uncommitted changes in `extension/`, and writes `dist/download-router-<version>.zip` without dev files. Upload that zip in the developer dashboard. More in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Companion app

```bash
cd companion
npm install
npm start          # Run in dev mode
npm run build:mac  # Build macOS DMG
npm run build:win  # Build Windows installer (from macOS, but test on Windows)
```

**Logs:**
- **macOS**: `~/Library/Logs/Download Router Companion/`
- **Windows**: `%APPDATA%\Download Router Companion\logs\`

```bash
# macOS/Linux
tail -f ~/Library/Logs/Download\ Router\ Companion/companion-main-latest.log

# Windows (PowerShell)
Get-Content "$env:APPDATA\Download Router Companion\logs\companion-main-latest.log" -Wait -Tail 20
```

## Known issues and limitations

- Companion app is manual install only for now; Windows builds need real Windows testing
- Chrome's ~15 second limit means the card can't hold a download forever (see above)
- Changing the folder after a file was saved, without the companion app, means downloading it again. Doesn't work for `blob:`/`data:` or single-use links.
- No card on the New Tab page, `chrome://` pages or the Chrome Web Store; those downloads save straight away using your rules

## Troubleshooting

**Downloads aren't being sorted:**
- Check the switch in the popup is on
- Check the rule in Settings (spelling of the site or word)
- Remember the order: a website rule beats a file name rule, which beats a file type. The card's footnote tells you which rule matched.

**Card isn't showing up:**
- Make sure "Show the card before saving" is on in Settings
- Reload the page if it was open before you installed or updated the extension
- It won't show on New Tab / `chrome://` pages; those save right away

**Companion app not connecting:**
- Check the native messaging host manifest exists (see [docs/COMPANION_INSTALL.md](docs/COMPANION_INSTALL.md))
- Make sure the extension ID in it matches yours
- Quit and reopen Chrome completely
- Check the companion logs (paths above)

See [docs/TESTING.md](docs/TESTING.md) for more.

## Contributing

Contributions welcome. Some areas that could use help:
- Windows testing and bug fixes
- A proper companion app installer
- More file type groups
- Better error messages

Follow the existing code style and test your changes before opening a PR.

## Privacy

The extension doesn't collect or send anything anywhere. Rules and settings are stored in Chrome (synced by Chrome if you have sync on). No analytics, no tracking, no servers.

See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License

## Version history

See [CHANGELOG.md](CHANGELOG.md) for the full list.

### v2.2.0
- New download card, popup and settings page (one page, rules in the order they're checked)
- Fixed rule order: Websites → File names → File types → Everything else. Priority numbers and override/tie settings are gone; old rules are migrated once and backed up
- Picking a new folder after Chrome already saved the file now moves it there
- Downloads save right away where the card can't show, and never wait longer than Chrome allows
- Lots of fixes (trailing commas in rules, nested Downloads folders, input validation)
- Fewer permissions (`tabs` and `activeTab` removed) and a smaller package

### v2.1.3
- First Chrome Web Store release
- File name rules, website rules with paths (`github.com/octocat`), proper subdomain matching
- Folder autocomplete for people without the companion app

### v2.1.0
- Production-ready extension
- Cross-platform companion app
- Improved file conflict handling
- Better error messages
- Code cleanup

### v2.0.0
- Complete UI redesign with Shadow DOM
- Dark mode support
- Statistics and activity tracking
- Companion app with native messaging
- Enhanced notification system

### v1.0.0
- Initial release
- Basic domain and file type routing
- Simple configuration interface
