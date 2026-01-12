# Download Router

A Chrome extension that automatically saves your downloads to different folders based on rules you set. Instead of everything landing in Downloads, route files by website domain or file type.

## What it does

You create rules like "anything from github.com goes to Code/GitHub" or "all .stl files go to 3DPrinting". When you download something, the extension moves it to the right folder. No more digging through Downloads trying to find stuff.

The extension shows a confirmation overlay so you can see where it's going and change it if needed. It auto-saves after a few seconds if you don't interact with it.

## Status

- **Extension**: v2.1.0, works on macOS and Windows
- **Companion App**: v1.0.0, tested on macOS. Windows builds ready but need testing on actual Windows machine
- **Chrome Web Store**: Not published yet

The companion app is optional but recommended. Without it, you can only route files to folders within your Downloads directory. With it, you get native folder pickers and can save files anywhere on your computer.

**Companion App Installation**: Currently in progress - the installer is being improved. See `companion/INSTALL.md` for manual installation steps.

## Installation

### Quick start (extension only)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `extension/` folder

That's it. The extension works without the companion app, but you'll be limited to routing files within your Downloads folder.

### Companion app (recommended)

The companion app enables:
- Native OS folder picker dialogs
- Saving files anywhere on your computer (absolute paths)
- Post-download file moving (download to Downloads, then move elsewhere)

Installation steps are in `companion/INSTALL.md`. The installer setup is still being worked on - for now you'll need to manually run the installer script.

## How it works

### Rules

You can create two types of rules:

1. **Domain rules**: Route downloads based on the website
   - Example: `printables.com` → `3DPrinting/`
   - Example: `github.com` → `Code/GitHub/`

2. **File type groups**: Route downloads based on file extension
   - Example: All `.stl`, `.obj`, `.3mf` files → `3DPrinting/`
   - Example: All `.pdf` files → `Documents/PDFs/`

Domain rules always win over file type rules. If multiple rules could apply, you can configure tie-breaker behavior in settings.

### Confirmation overlay

When you download something, a small overlay appears in the bottom-right showing where the file will be saved. You can:
- Change the destination for just this download
- Quickly create a new rule
- Let it auto-save after the countdown (default 5 seconds)

If the overlay can't be injected (some sites block it), you'll get a Chrome notification instead with the same options.

### Settings

Access settings by right-clicking the extension icon → Options.

- **Rules tab**: Add/edit domain and file type routing rules
- **Groups tab**: Organize file extensions into groups (videos, images, documents, etc.)
- **Settings tab**: Configure confirmation timeout, tie-breakers, companion app status
- **Folders tab**: Browse and manage your download destinations

The extension popup (click the icon) shows quick stats and recent downloads.

## Default file groups

The extension comes with some pre-configured groups:

- **Videos**: mp4, mov, mkv, avi, wmv, flv, webm
- **Images**: jpg, jpeg, png, gif, bmp, svg, webp
- **Documents**: pdf, doc, docx, txt, rtf, odt
- **3D Files**: stl, obj, 3mf, step, stp, ply
- **Archives**: zip, rar, 7z, tar, gz
- **Software**: exe, msi, dmg, deb, rpm, pkg

You can modify these or create your own.

## Technical stuff

### Architecture

- Manifest V3 extension
- Shadow DOM for overlay isolation (doesn't interfere with websites)
- Service worker handles download interception and routing logic
- Companion app is Electron-based, uses Chrome native messaging API

### Companion app structure

The companion app code is cross-platform - same source works on macOS, Windows, and Linux. Platform-specific stuff (like folder pickers) uses `process.platform` to detect the OS and call the right native commands:

- macOS: osascript for dialogs
- Windows: PowerShell for dialogs
- Linux: zenity/kdialog for dialogs

File operations (move, verify, create folders) use Node.js fs module which is already cross-platform.

### File structure

```
extension/           # Chrome extension (load this in Chrome)
  ├── manifest.json
  ├── background.js  # Service worker, routing logic
  ├── content.js     # Overlay injection
  ├── options.js     # Settings page
  ├── popup.js       # Extension popup
  └── lib/           # Shared utilities

companion/           # Electron companion app
  ├── main.js        # Entry point, native messaging host
  ├── native-messaging/
  ├── services/      # Folder picker, file mover, etc.
  └── install/       # Installation scripts

docs/                # Documentation
tests/               # Test scripts
```

## Development

### Extension development

1. Load the `extension/` folder in Chrome (Developer mode → Load unpacked)
2. Make changes
3. Reload the extension in `chrome://extensions/`
4. Test

No build step needed for development. Use Chrome DevTools for debugging.

### Companion app development

```bash
cd companion
npm install
npm start          # Run in dev mode
npm run build:mac  # Build macOS DMG
npm run build:win  # Build Windows installer (from macOS, but test on Windows)
```

The same codebase builds for both platforms. Platform detection happens at runtime.

## Known issues and limitations

- Companion app installer needs work (documented in progress)
- Windows companion app builds exist but need real Windows testing
- Some websites block the overlay injection (falls back to notifications)
- Extension ID detection could be smoother (working on it)

## Troubleshooting

**Extension not routing downloads:**
- Check that it's enabled in `chrome://extensions/`
- Verify your rules are set up correctly (check spelling)
- Make sure folders exist (or enable auto-create in settings)

**Companion app not connecting:**
- Check the native messaging host manifest exists (see `companion/INSTALL.md`)
- Verify the extension ID in the manifest matches your actual extension ID
- Restart Chrome completely (not just reload)
- Check logs at `~/Library/Logs/Download Router Companion/` (macOS)

**Overlay not appearing:**
- Some sites block content script injection
- Check for Chrome notifications instead
- Enable notifications in Chrome settings if needed

See `docs/TESTING.md` for more detailed troubleshooting.

## Contributing

Contributions welcome. Some areas that could use help:
- Windows testing and bug fixes
- Companion app installer improvements
- Additional file type groups
- Better error messages

Follow the existing code style and test your changes before submitting a PR.

## License

MIT License

## Version history

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
