# Privacy Policy

**Download Router Chrome Extension**  
**Last updated:** January 12, 2026

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

All extension data is stored locally on your device using Chrome's storage API:

- **Routing rules**: Domain and file type rules you create
- **Settings**: Confirmation timeout, conflict resolution preferences
- **Statistics**: Local download counts (never transmitted)
- **Recent activity**: Last few downloads for the popup display

This data never leaves your computer unless you manually export it or Chrome syncs your extension settings across devices (if you have Chrome Sync enabled).

## Permissions Explained

The extension requires these permissions to function:

### `downloads`
Core functionality. Allows the extension to:
- Intercept downloads before they're saved
- Suggest new file paths based on your rules
- Monitor download completion status
- Move files after download (with companion app)

### `storage`
Saves your routing rules and preferences locally on your device. Allows configuration to persist betIen browser sessions.

### `notifications`
Shows fallback notifications when the overlay can't be injected on certain Ibsites. These are local Chrome notifications, not push notifications from a server.

### `activeTab` and `tabs`
Allows the extension to:
- Inject the confirmation overlay into Ib pages
- Detect the current Ibsite domain for rule matching
- Send messages to the overlay in active tabs

### `nativeMessaging`
Enables communication with the companion app (if installed) for:
- Native OS folder picker dialogs
- Moving files to absolute paths outside Downloads
- Creating folders and verifying paths

This communication happens entirely on your local computer betIen Chrome and the companion app. No network communication involved.

### `host_permissions` (`<all_urls>`)
Required to inject the confirmation overlay on any Ibsite. The extension needs this broad permission because it can't predict which Ibsites you'll download from. The extension does not read page content or track your browsing.

## Companion App

The companion app (optional):
- Runs entirely on your local computer
- Communicates with the extension via Chrome's native messaging protocol (local IPC, not network)
- Does not make network requests
- Does not collect or transmit data
- Logs are stored locally at `~/Library/Logs/Download Router Companion/` (macOS) or `%APPDATA%/Download Router Companion/logs` (Windows)

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
- View all stored data by opening the extension options and exporting your configuration
- Delete all data by resetting the extension to defaults in settings
- Remove all data by uninstalling the extension (Chrome automatically removes extension storage)

---

**In short:** I don't collect your data. I don't track you. Everything happens on your computer.
