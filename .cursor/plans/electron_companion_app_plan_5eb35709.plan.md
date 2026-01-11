---
name: Electron Companion App Plan
overview: Create an Electron-based companion application that provides native OS folder picker, absolute path support, and folder verification through Chrome's Native Messaging API. The extension will gracefully detect companion app status and fall back to relative paths when unavailable.
todos:
  - id: create-companion-structure
    content: Create Electron companion app project structure with package.json and main.js
    status: completed
  - id: implement-native-messaging
    content: Implement native messaging protocol (stdin/stdout JSON with length prefix)
    status: completed
    dependencies:
      - create-companion-structure
  - id: implement-folder-picker
    content: Implement native folder picker using electron.dialog.showOpenDialog
    status: completed
    dependencies:
      - implement-native-messaging
  - id: implement-folder-operations
    content: Implement folder verification, creation, and listing services
    status: completed
    dependencies:
      - create-companion-structure
  - id: implement-file-mover
    content: Implement post-download file move service for absolute path support
    status: completed
    dependencies:
      - implement-folder-operations
  - id: update-manifest
    content: Add nativeMessaging permission to manifest.json
    status: completed
  - id: create-messaging-client
    content: Create native messaging client wrapper for extension
    status: completed
    dependencies:
      - update-manifest
  - id: implement-companion-detection
    content: Add companion app detection and version checking to background.js
    status: completed
    dependencies:
      - create-messaging-client
  - id: update-options-ui
    content: Update options.js to use native folder browser with fallback
    status: completed
    dependencies:
      - implement-companion-detection
  - id: update-overlay-ui
    content: Update content.js overlay to use native folder picker with fallback
    status: completed
    dependencies:
      - implement-companion-detection
  - id: create-native-manifests
    content: Create native messaging host manifests for macOS and Windows
    status: completed
    dependencies:
      - implement-native-messaging
  - id: create-installers
    content: Create installation scripts for both platforms
    status: completed
    dependencies:
      - create-native-manifests
  - id: configure-electron-builder
    content: Configure electron-builder for DMG and NSIS packaging
    status: completed
    dependencies:
      - implement-file-mover
  - id: create-documentation
    content: Create COMPANION_INSTALL.md and update README
    status: completed
    dependencies:
      - create-installers
---

# Electron Companion App Implementation Plan

## Phase 1: Current State Analysis

### What Works Now (Keep These Improvements)

The codebase has well-designed path utility functions that should be preserved:

**In [`background.js`](background.js) (lines 41-144):**

- `extractFilename(path)` - Extracts filename from paths with either slash type
- `normalizePath(path)` - Converts backslashes, removes leading/trailing slashes
- `sanitizeFolderName(folder)` - Removes invalid characters, prevents path traversal
- `buildRelativePath(folder, filename)` - Constructs valid Chrome downloads API paths

**In [`content.js`](content.js) (lines 32-83):**

- Duplicate path utilities for overlay context (keep for consistency)

**Working Features:**

- Download interception via `onDeterminingFilename`
- Domain and extension rule matching with tie-breaker logic
- Shadow DOM overlay with countdown timer
- Rules editor and location picker panels
- Fallback Chrome notifications

### What Still Doesn't Work

**Chrome Downloads API Limitation (Root Cause):**

```javascript
// background.js line 595-598
downloadInfo.originalSuggest({ 
  filename: finalPath,  // <-- MUST be relative path within Downloads folder
  conflictAction: 'uniquify'
});
```

The `suggest()` function ONLY accepts:

- Relative paths within user's Downloads directory
- Example: `"Images/photo.jpg"` becomes `~/Downloads/Images/photo.jpg`

It does NOT support:

- Absolute paths like `/Users/john/Documents/file.pdf`
- Paths outside Downloads directory
- Native OS folder selection

**Simulated Folder Browser (options.js lines 467-486):**

```javascript
async loadFolders() {
  // Simulate folder loading - NOT real file system access
  this.availableFolders = this.getCommonFolders();  // Hardcoded list!
}
```

The current folder browser is just a hardcoded list of common folder names - it cannot browse the actual file system.

### Why Chrome Relative Paths Don't Solve the Problem

1. **Limited to Downloads directory** - Users cannot route to `/Documents/Work/` or `D:\Projects\`
2. **No folder verification** - Cannot check if folders exist before saving
3. **No native picker** - Users must manually type folder names
4. **No folder creation** - Cannot create missing folders programmatically
5. **No absolute paths** - Cannot save outside Downloads hierarchy

## Phase 2: Technology Choice - Electron

### Why Electron Over Python

| Factor | Electron | Python |

|--------|----------|--------|

| **Native dialogs** | Built-in `dialog.showOpenDialog` | Requires tkinter or pyobjc |

| **Distribution size** | ~60-100MB | ~10-15MB |

| **Auto-update** | Built-in `electron-updater` | Manual implementation |

| **Code sharing** | Same JavaScript as extension | Different language |

| **Build process** | electron-builder (mature) | PyInstaller (works but quirky) |

| **Resource usage** | Higher (~50MB RAM) | Lower (~10MB RAM) |

**Recommendation: Electron** because:

1. Native dialogs are first-class citizens
2. Auto-update is critical for companion apps
3. Single language across the entire project
4. Better distribution tooling (DMG, NSIS installer, etc.)
5. User explicitly mentioned Electron as ideal

For users who prefer ultra-lightweight, Python can be a future alternative.

## Phase 3: Architecture

### Communication Flow

```
User clicks "Browse" 
       |
       v
Chrome Extension (background.js)
       |
       | chrome.runtime.connectNative()
       v
Native Messaging Host (Electron)
       |
       | electron.dialog.showOpenDialog()
       v
OS Folder Picker (native Finder/Explorer)
       |
       | Selected folder path
       v
Electron returns absolute path via stdout
       |
       v
Extension receives path
       |
       v
Extension saves rule with path
```

### How Absolute Paths Work

The key insight: Chrome's `suggest()` is limited to relative paths within Downloads, BUT:

1. **For rules/settings**: Store absolute paths in Chrome storage
2. **For display**: Show absolute paths to user in UI
3. **For downloads**: The companion app can MOVE files after Chrome downloads them

Two approaches for actual routing:

**Approach A: Post-Download Move (Simpler)**

1. Chrome downloads file to default Downloads folder
2. Companion app monitors for new files
3. Companion app moves file to target absolute path
4. Works with any path on the file system

**Approach B: Downloads API Only (Current, Limited)**

1. Continue using relative paths within Downloads
2. Companion app only provides folder picker
3. Paths are still limited to Downloads subfolders

**Recommendation: Approach A** - Post-download file moving is the only way to truly support absolute paths.

## Phase 4: Implementation Structure

### New Files to Create

```
/Users/Shared/Github-repo/
├── companion/                          # Electron app
│   ├── package.json                    # Dependencies
│   ├── main.js                         # Main process
│   ├── preload.js                      # Security bridge
│   ├── native-messaging/
│   │   ├── host.js                     # Native messaging protocol
│   │   └── handlers.js                 # Message handlers
│   ├── services/
│   │   ├── folder-picker.js            # Native dialog wrapper
│   │   ├── file-mover.js               # Post-download file moving
│   │   └── folder-operations.js        # Verify, create, list
│   ├── manifests/
│   │   ├── com.downloadrouter.host.json
│   │   └── install-manifest.js         # Install helper
│   ├── build/
│   │   ├── electron-builder.yml        # Build config
│   │   └── icons/                      # App icons
│   └── README.md
├── lib/                                # Shared utilities (new)
│   └── native-messaging-client.js      # Extension-side native messaging
├── manifest.json                       # Add nativeMessaging permission
├── background.js                       # Add companion communication
├── content.js                          # Use native picker
├── options.js                          # Use native folder browser
└── COMPANION_INSTALL.md                # User installation guide
```

### Files to Modify

**[`manifest.json`](manifest.json)**

- Add `nativeMessaging` permission
- Bump version to 2.1.0

**[`background.js`](background.js)**

- Add native messaging connection module
- Add companion app detection
- Add file move monitoring (for post-download moves)
- Keep existing path utilities

**[`content.js`](content.js)**

- Update "Browse" button to request native picker
- Show "Install Companion App" prompt if not available

**[`options.js`](options.js)**

- Replace simulated folder browser with native messaging calls
- Add companion app status indicator
- Add "Install Companion App" button

## Phase 5: Native Messaging Protocol

### Message Types

**Extension to Companion:**

```json
// Pick a folder using native OS dialog
{ "type": "pickFolder", "startPath": "/Users/john/Downloads" }

// Verify a folder exists
{ "type": "verifyFolder", "path": "/Users/john/Documents/Work" }

// Create a folder
{ "type": "createFolder", "path": "/Users/john/Documents/NewFolder" }

// List folder contents
{ "type": "listFolders", "path": "/Users/john/Downloads" }

// Move a file (post-download)
{ "type": "moveFile", "source": "/Users/john/Downloads/file.pdf", "destination": "/Users/john/Documents/file.pdf" }

// Get companion app version
{ "type": "getVersion" }
```

**Companion to Extension:**

```json
// Success response
{ "success": true, "type": "folderPicked", "path": "/Users/john/Documents/Work" }

// Error response
{ "success": false, "error": "User cancelled", "code": "CANCELLED" }

// Version response
{ "success": true, "type": "version", "version": "1.0.0", "platform": "darwin" }
```

## Phase 6: Companion App Detection and Lifecycle

### Detection Flow

```javascript
// In background.js - new function
async function checkCompanionApp() {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative('com.downloadrouter.host');
      port.onMessage.addListener((msg) => {
        if (msg.type === 'version') {
          resolve({ installed: true, version: msg.version });
          port.disconnect();
        }
      });
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          resolve({ installed: false, error: chrome.runtime.lastError.message });
        }
      });
      port.postMessage({ type: 'getVersion' });
      
      // Timeout after 2 seconds
      setTimeout(() => resolve({ installed: false, error: 'timeout' }), 2000);
    } catch (e) {
      resolve({ installed: false, error: e.message });
    }
  });
}
```

### User Prompts

**When companion not installed:**

- Show subtle banner in options page: "Install companion app for native folder picker"
- Show inline prompt in overlay when user clicks "Browse"
- Never block core functionality - fall back to manual text input

**When companion needs update:**

- Compare extension's expected companion version with actual
- Show update prompt if mismatch
- Link to download page

### Fallback Behavior

| Feature | With Companion | Without Companion |

|---------|----------------|-------------------|

| Folder picker | Native OS dialog | Manual text input (current) |

| Folder browser | Real file system | Hardcoded list (current) |

| Absolute paths | Full support | Relative only (Downloads) |

| Folder verification | Before save | None |

| Post-download move | Automatic | Manual |

## Phase 7: Implementation Steps

### Step 1: Create Electron Companion App Structure

- Initialize npm project
- Set up main process with native messaging protocol
- Implement folder picker service
- Test standalone (without extension)

### Step 2: Add Native Messaging Permission to Extension

- Update manifest.json with `nativeMessaging` permission
- Create native messaging client wrapper in extension

### Step 3: Implement Companion Detection in Extension

- Add connection test on extension load
- Store companion status in local storage
- Create UI components for status display

### Step 4: Update Extension UI for Companion Integration

- Modify options.js folder picker to use native messaging
- Update content.js browse button to request native picker
- Add fallback behavior when companion unavailable

### Step 5: Implement Post-Download File Moving

- Add file watcher in companion app
- Implement move operation with error handling
- Update extension to track which files need moving

### Step 6: Build and Package

- Configure electron-builder for macOS (DMG) and Windows (NSIS)
- Create installer scripts for native messaging manifest
- Test installation flow on both platforms

### Step 7: Create User Documentation

- Installation guide for companion app
- Troubleshooting section
- Update main README

## Phase 8: Key Decision Points

### Decision 1: Post-Download Move vs Relative Only

**Recommended:** Post-download move for full absolute path support

**Alternative:** Relative paths only (simpler but limited)

### Decision 2: File Move Trigger

**Option A:** Extension sends move command after download completes

**Option B:** Companion watches Downloads folder for new files

**Recommended:** Option A (more control, less resource usage)

### Decision 3: Update Mechanism

**Option A:** Check GitHub releases on extension load

**Option B:** Built-in electron-updater with separate update server

**Recommended:** Option A for simplicity (GitHub releases)

### Decision 4: Installation Method

**Option A:** Manual download and run installer

**Option B:** Chrome Web Store hosts link to companion download

**Recommended:** Option A with clear in-extension prompts

## Phase 9: Testing Strategy

### Unit Tests

- Path utility functions (existing)
- Native messaging protocol encoding/decoding
- Message handler routing

### Integration Tests

- Extension to companion communication
- Folder picker returns valid paths
- File move operations complete successfully

### Platform Tests

- macOS: DMG installation, native messaging manifest in correct location
- Windows: NSIS installer, registry entries correct

### Fallback Tests

- Extension works when companion not installed
- Graceful handling when companion crashes
- Proper error messages for each failure mode

## Summary

### Immediate Next Steps

1. **Create `companion/` directory** with Electron project structure
2. **Implement native messaging host** (`main.js`, `host.js`)
3. **Add folder picker service** using `electron.dialog`
4. **Update `manifest.json`** with `nativeMessaging` permission
5. **Create detection module** in `background.js`
6. **Update UI components** to use companion when available

### Files Changed (Summary)

| File | Change Type | Description |

|------|-------------|-------------|

| `manifest.json` | Modify | Add nativeMessaging permission |

| `background.js` | Modify | Add companion communication, keep path utils |

| `content.js` | Modify | Native picker integration, keep path utils |

| `options.js` | Modify | Real folder browser, status indicator |

| `companion/*` | Create | New Electron app |

| `lib/native-messaging-client.js` | Create | Shared communication layer |

| `COMPANION_INSTALL.md` | Create | User installation guide |