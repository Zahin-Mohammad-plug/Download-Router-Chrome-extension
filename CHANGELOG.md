# Changelog

All notable changes to the Download Router extension are listed here. The companion app is versioned separately.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [2.2.0] - Unreleased

### Added
- New download card. It shows the file, a **Save to [folder]** button with a folder menu (folders you use, New Folder…, Rename File…, and Other Location… with the companion app), an **"Always save files from <site> / all .<ext> files here"** checkbox that creates the rule for you, and a Save button with a countdown ring. Hovering pauses it; ✕ cancels the download. The footnote says which rule matched.
- New popup: Recent downloads (click to show in Finder / Explorer), a **This site** line with **Change** to set a website rule, an on/off switch and a Settings link.
- New single-page Settings: numbered Websites / File names / File types / Everything else sections in the order they're checked, Download card options (show card on/off, save after 3s / 5s / 10s) and a Companion app row.
- Welcome note after install with **Try It**, which downloads a bundled sample PDF so you can see the card work.
- Picking a new folder after Chrome has already saved the file now moves it there: a real move with the companion app, or a fresh download into the new folder (the first copy is then deleted) without it. Not possible for `blob:` / `data:` downloads or single-use links; the card says where the file is instead.
- Shared input validation for websites, file names, extensions and folders, with one clear error line in the card, popup and Settings.
- `scripts/package.sh` builds the store zip (`dist/download-router-<version>.zip`) and checks version, manifest files and remote-code patterns.

### Changed
- **Rules are checked in a fixed order**: Websites (subdomains included; a path rule like `github.com/octocat` beats `github.com`) → File names → File types (single-extension rules, then groups) → Everything else. First match wins.
- Priority numbers, "override site rules" and "ask when rules tie" are gone. Existing rules are migrated once on update. The old rules are backed up in `chrome.storage.local` (`rulesBackupV1`), and people whose routing could change see a one-time note in Settings.
- The card saves at 12 seconds at most, because Chrome stops waiting for an extension after about 15 seconds and would otherwise ignore the rules.
- Where the card can't appear (New Tab page, `chrome://` pages, Web Store), downloads are saved right away using the rules instead of waiting.
- The card is added to tabs that were already open when the extension was installed or updated.
- Without the companion app, folders are always inside Downloads. An absolute folder synced from another computer falls back to the folder with the same name inside Downloads.
- Debug logging is off by default.
- The manifest description now matches the store: "Sort downloads into folders by website, file name or type. A small card shows where each file goes and lets you change it."
- Requires Chrome 102 or newer (`minimum_chrome_version`).

### Removed
- `tabs` and `activeTab` permissions. `scripting` was added so the card can be added to tabs that were already open.
- Old overlay (`overlay.js`, `overlay.css`), `lib/icons.js`, the Rules/Groups/Settings/Folders tabs, the rule chips and inline rule editors on the card, and the stats in the popup.
- The 1.2 MB source icon from the package (it now lives in `docs/design/`), so the package is much smaller.

### Fixed
- Tie-break bug: when two rules had the same priority, website rules were sorted last instead of first (a `0` order value was treated as "missing"). A priority of `0` was also treated as `2`.
- A trailing comma in a rule (`invoice,`) created an empty word that matched every file.
- A folder written as `Downloads/Videos` was saved to `Downloads/Downloads/Videos`.
- File names, sites and folder names are escaped before they go into the card, popup or Settings.
- Companion app: a destination folder that didn't exist yet was sometimes treated as a file name (a missing `/Volumes/NAS/Models` became a file called `Models`). Now the folder is created and the file goes inside it. Closing the native folder picker is no longer reported as an error.

## [2.1.3] - 2026-01-26

First release on the [Chrome Web Store](https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn).

### Added
- File name rules ("contains" a word or phrase).
- Website rules with a path (`github.com/org/repo`) that are more specific than plain domain rules.
- Modals for editing rules and file type groups.
- Inline folder autocomplete on the overlay for people without the companion app.

### Changed
- Subdomain matching fixed: `github.com` covers `api.github.com`, and no longer matches unrelated domains like `hub.com`.
- Blob downloads and CDN downloads are matched by their page's site (blob origin / referrer).
- Better overlay dropdown positioning and styling.
- Messaging between the overlay and the service worker for rules and groups, with better error handling.

## [2.1.0]

### Added
- Cross-platform companion app (native folder picker, save anywhere, move after download).

### Changed
- Improved file conflict handling and error messages; code cleanup.

## [2.0.0]

### Added
- UI redesign with Shadow DOM, dark mode.
- Statistics and activity tracking.
- Companion app over native messaging.
- Notification system.

## [1.0.0]

### Added
- Initial release: domain and file type routing with a simple settings page.

