# Download Router Chrome Extension

Automatically organize your downloads by routing them to specific folders based on website domains and file types.

## ✨ Features

### 🎯 Smart Download Routing
- **Domain-based routing**: Route downloads from specific websites to designated folders (e.g., `printables.com` → `/3DPrinting/`)
- **File type groups**: Organize files by extension into predefined or custom groups (e.g., `.exe`, `.msi` → `/SoftwareInstallers/`)
- **Rule priority system**: Domain rules take precedence over file type rules for precise control
- **Tie-breaker preferences**: Choose which rule to apply when multiple rules match

### 🎨 Modern User Interface
- **Shadow DOM isolation**: Clean, isolated styling that doesn't interfere with websites
- **Professional overlay system**: Floating confirmation with countdown timer and intuitive controls
- **Dark mode support**: Automatic theme switching based on system preferences
- **Responsive design**: Works seamlessly on all screen sizes

### ⚙️ Advanced Configuration
- **Tabbed settings interface**: Organized rules management, groups configuration, and settings
- **Folder browser**: Visual folder picker for easy path selection
- **Real-time validation**: Instant feedback and rule conflict detection
- **Export/import**: Backup and share your configuration

### 📊 Activity Tracking
- **Download statistics**: Track total downloads, routed files, and efficiency metrics
- **Recent activity**: View recent downloads with routing status
- **Performance insights**: Monitor how well your rules are working

### 🔔 Fallback Notifications
- **Overlay injection**: Primary method with professional styling and animations
- **Chrome notifications**: Fallback system when overlay injection fails
- **Action buttons**: Save, change location, or edit rules directly from notifications
- **Auto-save timeout**: Configurable delay before automatic file saving

## 🚀 Installation

### Manual Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Download Router icon will appear in your extension toolbar

### From Chrome Web Store
*Coming soon - pending review*

## 📖 Usage

### Setting Up Rules

#### Domain Rules
Route downloads from specific websites to folders:
1. Open the extension options
2. Go to the "Rules" tab
3. Click "Add Domain Rule"
4. Enter the domain (e.g., `github.com`) and target folder (e.g., `Code/GitHub`)

#### File Type Groups
Organize files by extension:
1. Go to the "Groups" tab in options
2. Create or modify groups (e.g., "3D Files" for `.stl`, `.obj`, `.3mf`)
3. Assign folders to each group

#### Priority System
When multiple rules match a download:
- **Domain rules** always take precedence
- **File type rules** apply when no domain rule matches
- **Tie-breaker settings** determine behavior when conflicts occur

### Confirmation System

When you download a file, you'll see a floating overlay in the bottom-right corner with:
- **File destination**: Shows where the file will be saved
- **Edit Rules**: Quick access to create new routing rules
- **Change Location**: Modify the destination for this download
- **Save countdown**: 5-second timer before auto-save (pauses during interaction)

If the overlay fails to appear, you'll receive a Chrome notification with the same options.

### Managing Your Setup

#### Extension Popup
Click the extension icon to view:
- **Extension status**: Enable/disable routing
- **Quick statistics**: Downloads processed, rules active, efficiency rating
- **Recent activity**: Last few downloads with routing status

#### Options Page
Right-click the extension icon and select "Options" for:
- **Rules management**: Create, edit, and organize routing rules
- **Groups configuration**: Set up file type categories
- **Settings**: Adjust confirmation timeout, tie-breaker preferences
- **Folder browser**: Visual selection of download destinations

## ⚙️ Configuration Options

### General Settings
- **Enable confirmation overlay**: Show/hide the download confirmation dialog
- **Confirmation timeout**: Time before auto-save (1-30 seconds)
- **Tie-breaker preference**: Domain priority, Extension priority, or Ask user

### Default Groups
The extension includes these predefined groups:
- **Videos**: `mp4`, `mov`, `mkv`, `avi`, `wmv`, `flv`, `webm`
- **Images**: `jpg`, `jpeg`, `png`, `gif`, `bmp`, `svg`, `webp`
- **Documents**: `pdf`, `doc`, `docx`, `txt`, `rtf`, `odt`
- **3D Files**: `stl`, `obj`, `3mf`, `step`, `stp`, `ply`
- **Archives**: `zip`, `rar`, `7z`, `tar`, `gz`
- **Software**: `exe`, `msi`, `dmg`, `deb`, `rpm`, `pkg`

## 🛠️ Technical Details

### Architecture
- **Manifest V3**: Latest Chrome extension platform
- **Shadow DOM**: Isolated styling for overlay components
- **Chrome APIs**: Downloads, Storage, Notifications, ActiveTab
- **Modern CSS**: CSS Grid, Flexbox, Custom Properties, Dark Mode

### File Structure
```
📁 Download-Router-Chrome-extension/
├── 📄 manifest.json          # Extension configuration
├── 📄 background.js           # Service worker & routing logic
├── 📄 content.js             # Shadow DOM overlay system
├── 📄 popup.html/js/css      # Extension popup interface
├── 📄 options.html/js/css    # Settings & configuration
├── 📁 icons/                 # Extension icons
└── 📄 README.md              # Documentation
```

### Permissions Required
- `downloads`: Monitor and modify download behavior
- `storage`: Save rules and preferences
- `notifications`: Fallback notification system
- `activeTab`: Inject overlay into current tab
- `host_permissions`: Access all websites for overlay injection

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature-name`
3. **Make your changes**: Follow the existing code style
4. **Test thoroughly**: Ensure all features work properly
5. **Submit a pull request**: Describe your changes clearly

### Development Setup
1. Clone the repository
2. Load the extension in Chrome (Developer mode)
3. Make changes to the code
4. Reload the extension to test changes
5. Use browser dev tools for debugging

### Code Standards
- Use modern JavaScript (ES6+)
- Follow consistent indentation (2 spaces)
- Add comments for complex logic
- Test cross-browser compatibility
- Ensure accessibility compliance

## 🐛 Troubleshooting

### Common Issues

**Overlay not appearing**
- Check if the website blocks content scripts
- Look for fallback notifications in Chrome
- Verify extension permissions

**Rules not working**
- Confirm rule syntax (domain/extension spelling)
- Check rule priority conflicts
- Review tie-breaker settings

**Downloads still going to default folder**
- Ensure extension is enabled
- Verify folder paths exist
- Check for browser download manager conflicts

### Debug Mode
Enable Chrome developer tools and check the console for error messages. The extension logs detailed information about rule matching and download processing.

## 📝 License

MIT License - see LICENSE file for details.

## 🔗 Links

- **GitHub Repository**: [Download-Router-Chrome-extension](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension)
- **Issues & Feature Requests**: [GitHub Issues](https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues)
- **Chrome Web Store**: *Coming soon*

## 📈 Version History

### v2.0.0 (Current)
- ✨ Complete UI redesign with Shadow DOM
- 🎨 Professional styling with dark mode support
- 📊 Real-time statistics and activity tracking
- 🔔 Enhanced fallback notification system
- ⚡ Improved performance and reliability

### v1.0.0
- 🎯 Basic domain and file type routing
- ⚙️ Simple configuration interface
- 📁 Folder picker functionality
- 🔧 Rule priority system

---

*Made with ❤️ for better download organization*
