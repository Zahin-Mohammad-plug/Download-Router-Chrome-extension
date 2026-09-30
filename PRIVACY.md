# Privacy Policy

**Download Router Chrome Extension**  
**Last updated:** September 30, 2026

## Summary

This extension does not collect, store, or transmit any personal data to external servers. Everything stays on your computer.

## Data Collection

**I collect nothing.** The extension:
- Does not track your browsing history
- Does not collect personal information
- Does not send data to external servers
- Does not use analytics or telemetry
- Does not contain ads or tracking scripts

## Data Storage

- **Rules and settings** (websites, file-name words, file types, folders, card timing, on/off) are saved with `chrome.storage.sync`. If Chrome Sync is on, Chrome copies them to your other computers through your own Google account. They are never sent to the developer.
- **Recent downloads** (your last 10 downloads: file name, folder, full path on disk, time) and a count of downloads are kept only on this computer in `chrome.storage.local`, for the popup's Recent list.
- **A backup of your rules** from before version 2.2 (when priority numbers were removed) is kept on this computer so they can be restored if needed.

## Moving a file after it was saved

Chrome only waits about 15 seconds for a folder choice. If you pick a new folder after that and the companion app isn't installed, the extension asks Chrome to download the same link again from the original website into the new folder, then deletes the first copy once the second one finishes. That second request goes only to the website you downloaded from. Links that work only once, or that aren't web links, are left where they were and you'll get a notification. With the companion app installed, the file is moved on your computer instead.

## Permissions Explained

The extension requires these permissions to function:

### `downloads`
Core functionality. Allows the extension to:
- Choose the folder and file name for each download based on your rules
- Monitor download completion status
- Show a download in its folder when you click it in the popup
- Download a file again into a new folder if you change your mind after Chrome saved it (see above)

### `storage`
Saves your routing rules and preferences locally on your device. Allows configuration to persist between browser sessions.

### `notifications`
Shows a local confirmation when a download has been routed or moved. These are local Chrome notifications, not push notifications from a server.

### `scripting`
Adds the download card to tabs that were already open when the extension was installed or updated, so it works without reloading those pages.

### `nativeMessaging`
Enables communication with the companion app (if installed) for:
- Native OS folder picker dialogs
- Moving files to absolute paths outside Downloads
- Creating folders and verifying paths

This communication happens entirely on your local computer between Chrome and the companion app. No network communication involved.

### `host_permissions` (`<all_urls>`)
Required to show the download card on any website and to read the current tab's address for site rules. The extension needs this broad permission because it can't predict which websites you'll download from. The extension does not read page content or track your browsing.

## Companion App

The companion app (optional):
- Runs entirely on your local computer
- Communicates with the extension via Chrome's native messaging protocol (local IPC, not network)
- Does not make network requests
- Does not collect or transmit data
- Keeps local log files that include the file names and folder paths it worked with, at `~/Library/Logs/Download Router Companion/` (macOS) or `%APPDATA%/Download Router Companion/logs` (Windows)

## Third-Party Services

None. The extension does not use:
- Analytics services
- Crash reporting services
- Ad networks
- External APIs
- Remote code execution

All code is contained within the extension package and runs locally on your device.

## Data Sharing

I don't share data because I don't collect it. Your routing rules, settings, and download activity are never transmitted to us or anyone else.

## Changes to This Policy

If I update this privacy policy, I'll update the "Last updated" date at the top and include changes in the extension's version release notes.

## Contact

Questions about privacy? Open an issue on [GitHub](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues).

## Your Rights

You can:
- Clear the Recent list from the popup (Clear)
- Edit or delete any rule in Settings
- Remove all extension data by uninstalling the extension (Chrome automatically removes extension storage)

---

**In short:** I don't collect your data. I don't track you. Everything happens on your computer.
