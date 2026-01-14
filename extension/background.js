/**
 * background.js
 * 
 * Purpose: Service worker for the Download Router Chrome extension.
 * Role: Handles download interception, routing logic, rule matching, notification management,
 *       and statistics tracking. Acts as the core backend service for the extension.
 * 
 * Key Responsibilities:
 * - Intercept downloads and determine target folders based on rules
 * - Match downloads against domain and file extension rules
 * - Manage download confirmation overlays and fallback notifications
 * - Track download statistics and activity history
 * - Handle rule and group management operations
 * - Communicate with companion app via Native Messaging API
 */

// Load native messaging client via importScripts (Manifest V3 supports this in service workers)
// IMPORTANT: Do NOT declare a variable here - access directly via self.nativeMessagingClient
// to avoid redeclaration errors when service worker reloads and importScripts runs multiple times
try {
  importScripts('lib/native-messaging-client.js');
  // Native messaging client should be available on self after importScripts
  // If for some reason it wasn't set, create a fallback stub on self
  if (!self.nativeMessagingClient) {
    self.nativeMessagingClient = {
      checkCompanionApp: () => Promise.resolve({ installed: false }),
      pickFolder: () => Promise.reject(new Error('Native messaging not available')),
      verifyFolder: () => Promise.resolve(false),
      moveFile: () => Promise.resolve(false)
    };
  }
} catch (e) {
  console.error('Failed to load native messaging client:', e);
  // Define minimal stub on self if loading fails
  self.nativeMessagingClient = {
    checkCompanionApp: () => Promise.resolve({ installed: false }),
    pickFolder: () => Promise.reject(new Error('Native messaging not available')),
    verifyFolder: () => Promise.resolve(false),
    moveFile: () => Promise.resolve(false)
  };
}

// Map to track pending downloads that are awaiting user confirmation or processing
let pendingDownloads = new Map();

// Companion app status cache
let companionAppStatus = {
  installed: false,
  version: null,
  platform: null,
  lastChecked: 0,
  checkInProgress: false
};

/**
 * Helper function to format path display in breadcrumb format.
 * Converts relative paths like "3DPrinting/file.stl" to "Downloads > 3DPrinting"
 * Handles absolute paths by showing the folder name.
 * 
 * Inputs:
 *   - relativePath: String path (relative or absolute)
 *   - absoluteDestination: Optional string absolute destination path
 * 
 * Outputs: String formatted for display
 */
function formatPathDisplay(relativePath, absoluteDestination = null) {
  // Handle absolute destination path
  if (absoluteDestination) {
    // Extract just the folder name from absolute path
    const parts = absoluteDestination.replace(/\\/g, '/').split('/').filter(p => p);
    return parts[parts.length - 1] || 'Custom Folder';
  }
  
  // Check if relativePath is actually an absolute path
  if (relativePath && /^(\/|[A-Za-z]:[\\\/])/.test(relativePath)) {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(p => p);
    return parts[parts.length - 1] || 'Custom Folder';
  }
  
  if (!relativePath || relativePath === '') return 'Downloads';
  const parts = relativePath.split('/');
  const filename = parts[parts.length - 1];
  // If it's just a filename (no folder), return Downloads
  if (parts.length === 1) {
    // Check if it contains a dot (likely a file extension)
    if (filename.includes('.')) {
      return 'Downloads';
    }
    return `Downloads > ${parts[0]}`;
  }
  // Show: Downloads > Folder > Subfolder (without filename)
  const folders = parts.slice(0, -1);
  return 'Downloads > ' + folders.join(' > ');
}

/**
 * Path Utility Functions
 * 
 * These functions handle path normalization, sanitization, and construction
 * for Chrome's downloads API, which requires relative paths with forward slashes.
 */

/**
 * Extracts just the filename from a potentially path-containing string.
 * Handles both forward and backslash separators.
 * 
 * Inputs:
 *   - path: String that may contain a full path or just a filename
 * 
 * Outputs: String containing just the filename (basename)
 * 
 * Examples:
 *   - "file.stl" → "file.stl"
 *   - "Downloads/file.stl" → "file.stl"
 *   - "C:\Users\John\Downloads\file.stl" → "file.stl"
 *   - "folder/subfolder/file.stl" → "file.stl"
 */
function extractFilename(path) {
  if (!path) return '';
  // Replace backslashes with forward slashes for consistent handling
  const normalized = path.replace(/\\/g, '/');
  // Extract last segment (filename)
  return normalized.split('/').pop();
}

/**
 * Normalizes a folder path by:
 * - Converting backslashes to forward slashes
 * - Removing leading/trailing slashes
 * - Collapsing multiple consecutive slashes
 * 
 * Inputs:
 *   - path: String path to normalize
 * 
 * Outputs: String with normalized path (empty string if input is empty/invalid)
 * 
 * Examples:
 *   - "3DPrinting" → "3DPrinting"
 *   - "3DPrinting/" → "3DPrinting"
 *   - "/3DPrinting" → "3DPrinting"
 *   - "3DPrinting\\models" → "3DPrinting/models"
 *   - "3DPrinting//models" → "3DPrinting/models"
 */
function normalizePath(path) {
  if (!path || path.trim() === '') return '';
  return path
    .replace(/\\/g, '/')  // Convert backslashes to forward slashes
    .replace(/^\/+|\/+$/g, '')  // Remove leading/trailing slashes
    .replace(/\/+/g, '/')  // Collapse multiple slashes
    .trim();
}

/**
 * Sanitizes folder name by removing invalid characters.
 * Windows invalid chars: < > : " | ? * \
 * Also prevents path traversal attempts.
 * 
 * Inputs:
 *   - folder: String folder name to sanitize
 * 
 * Outputs: String with sanitized folder name (empty string if input is empty/invalid)
 * 
 * Examples:
 *   - "3DPrinting" → "3DPrinting"
 *   - "Test<Folder>" → "TestFolder"
 *   - "Folder..name" → "Foldername"
 *   - "My Files" → "My Files" (spaces preserved)
 */
function sanitizeFolderName(folder) {
  if (!folder) return '';
  return folder
    .replace(/[<>:"|?*\\]/g, '')  // Remove invalid characters
    .replace(/\.\./g, '')  // Prevent path traversal
    .replace(/^\.+$/, '')  // Remove directories with only dots
    .trim();
}

/**
 * Checks if a path is an absolute path (starts with / on Unix or C:\ on Windows).
 * 
 * Inputs:
 *   - path: String path to check
 * 
 * Outputs: Boolean true if absolute path
 */
function isAbsolutePath(path) {
  if (!path) return false;
  return /^(\/|[A-Za-z]:[\\\/])/.test(path);
}

/**
 * Normalizes a domain value for rule matching.
 * Strips protocol, trailing slashes, paths, and www prefix.
 * 
 * Inputs:
 *   - domain: String domain value (may include protocol, path, etc.)
 * 
 * Outputs: String normalized domain (just hostname)
 * 
 * Examples:
 *   - "https://github.com/" → "github.com"
 *   - "http://www.example.com/path" → "example.com"
 *   - "github.com" → "github.com"
 *   - "www.github.com" → "github.com"
 */
function normalizeDomain(domain) {
  if (!domain) return '';
  let normalized = domain.trim();
  
  // Remove protocol (http://, https://)
  normalized = normalized.replace(/^https?:\/\//i, '');
  
  // Remove trailing slashes and paths
  normalized = normalized.split('/')[0];
  
  // Remove www. prefix
  normalized = normalized.replace(/^www\./i, '');
  
  // Remove port if present
  normalized = normalized.split(':')[0];
  
  return normalized.toLowerCase();
}

/**
 * Builds a valid relative path for Chrome downloads API.
 * Returns folder/filename or just filename if folder is empty.
 * 
 * Chrome's downloads API requires:
 * - Relative paths (not absolute)
 * - Forward slashes as separators (even on Windows)
 * - No path traversal (..) or invalid characters
 * 
 * Inputs:
 *   - folder: String folder path (may be empty, may contain nested folders)
 *   - filename: String filename (may contain path, will be extracted)
 * 
 * Outputs: String relative path for Chrome downloads API
 * 
 * Examples:
 *   - folder: "3DPrinting", filename: "file.stl" → "3DPrinting/file.stl"
 *   - folder: "3DPrinting/models", filename: "file.stl" → "3DPrinting/models/file.stl"
 *   - folder: "", filename: "file.stl" → "file.stl"
 *   - folder: "Downloads", filename: "file.stl" → "file.stl" (Downloads root)
 *   - folder: "My<Files>", filename: "C:\\path\\file.stl" → "MyFiles/file.stl"
 */
function buildRelativePath(folder, filename) {
  const cleanFolder = normalizePath(folder);
  const cleanFilename = extractFilename(filename);
  
  // If folder is empty or just "Downloads", download to Downloads root
  if (!cleanFolder || cleanFolder === 'Downloads') {
    return cleanFilename;
  }
  
  // Sanitize each folder segment in nested paths
  const folderSegments = cleanFolder.split('/')
    .map(segment => sanitizeFolderName(segment))
    .filter(segment => segment.length > 0);  // Remove empty segments after sanitization
  
  // If all segments were invalid, download to Downloads root
  if (folderSegments.length === 0) {
    return cleanFilename;
  }
  
  // Combine: folder1/folder2/filename.ext
  return `${folderSegments.join('/')}/${cleanFilename}`;
}

/**
 * Gets the default directory for Save As dialog based on download routing rules.
 * Returns the path to the directory where the file should be saved.
 * Can return absolute path or relative path (relative to Downloads).
 * Companion app will resolve relative paths appropriately.
 * 
 * Inputs:
 *   - downloadInfo: Object containing download metadata with resolvedPath, absoluteDestination, etc.
 * 
 * Outputs: String path to default directory (absolute if absoluteDestination, relative to Downloads otherwise)
 */
async function getDefaultSaveAsDirectory(downloadInfo) {
  // Get platform-specific Downloads directory
  // Note: We can't use Node.js os.homedir() in extension context,
  // so we'll return paths that companion app can resolve
  // The companion app will handle platform-specific path resolution
  
  if (downloadInfo.absoluteDestination) {
    // Absolute path was selected - extract parent directory (file path -> directory)
    // Remove filename and get directory
    const absPath = downloadInfo.absoluteDestination.replace(/\\/g, '/');
    // Check if it ends with a filename (has extension or doesn't look like directory)
    // If absoluteDestination is a directory, use it directly; if file path, extract directory
    if (absPath.match(/\.[a-zA-Z0-9]+$/)) {
      // Looks like a file path - extract directory
      const lastSlash = absPath.lastIndexOf('/');
      if (lastSlash > 0) {
        return absPath.substring(0, lastSlash);
      }
    }
    // Already a directory path, return as-is
    return absPath;
  }
  
  if (downloadInfo.resolvedPath && downloadInfo.resolvedPath.includes('/')) {
    // Relative path with subfolder (e.g., "3DPrinting/file.stl")
    // Extract folder part - companion app will resolve relative to Downloads
    const pathParts = downloadInfo.resolvedPath.split('/');
    if (pathParts.length > 1) {
      const folderPath = pathParts.slice(0, -1).join('/');
      // Return as relative path - companion app will resolve to Downloads subfolder
      return folderPath;
    }
  }
  
  // Default to Downloads root (empty string or null means Downloads root)
  // Companion app will use platform-specific Downloads directory
  return null;
}

/**
 * Main download interception listener.
 * Called by Chrome when a download is initiated to determine the filename/path.
 * 
 * Inputs:
 *   - downloadItem: Chrome downloads.DownloadItem object containing download metadata
 *   - suggest: Function to suggest a filename/path for the download
 * 
 * Outputs: Returns true to allow async operations (required for Chrome API)
 * 
 * External Dependencies:
 *   - chrome.downloads API: For download monitoring
 *   - chrome.storage.sync API: For retrieving user rules and settings
 *   - chrome.tabs API: For sending messages to content scripts
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Retrieve user configuration from Chrome sync storage
  // chrome.storage.sync.get: Retrieves stored extension settings
  //   Inputs: Array of keys to retrieve ['rules', 'tieBreaker', 'confirmationEnabled', 'confirmationTimeout']
  //   Outputs: Calls callback with data object containing stored values
  chrome.storage.sync.get(['rules', 'groups', 'confirmationEnabled', 'confirmationTimeout', 'defaultFolder', 'conflictResolution'], (data) => {
    // Load configuration with sensible defaults
    const rules = data.rules || [];
    const groups = data.groups || {};
    const confirmationEnabled = data.confirmationEnabled !== false; // Default to true
    const confirmationTimeout = data.confirmationTimeout || 5000; // Default 5 seconds
    const defaultFolder = data.defaultFolder || 'Downloads';
    const conflictResolution = data.conflictResolution || 'auto';
    
    // Extract download metadata
    const url = downloadItem.url;
    // Extract just the filename from downloadItem.filename (which may contain a path)
    const filename = extractFilename(downloadItem.filename);
    // Extract file extension from filename (last part after final dot, lowercase)
    const extension = filename.split('.').pop().toLowerCase();

    // Initialize rule matching arrays
    let domainMatches = [];
    let extensionMatches = [];
    let fileTypeMatches = [];
    let domain = 'unknown';

    // Extract domain from URL and find matching domain rules
    try {
      domain = new URL(url).hostname;
      const normalizedDomain = normalizeDomain(domain);
      // Filter enabled domain rules
      domainMatches = rules.filter(rule => {
        if (rule.type !== 'domain' || rule.enabled === false) return false;
        const normalizedRuleValue = normalizeDomain(rule.value);
        return normalizedDomain.includes(normalizedRuleValue) || 
               normalizedRuleValue.includes(normalizedDomain);
      }).map(r => ({...r, source: 'domain'}));
    } catch (e) {
      console.error("Invalid URL, cannot determine domain:", url);
    }
    
    // Find matching extension rules
    extensionMatches = rules.filter(rule => {
      if (rule.type !== 'extension' || rule.enabled === false) return false;
      return rule.value.split(',').map(ext => ext.trim().toLowerCase()).includes(extension);
    }).map(r => ({...r, source: 'extension'}));

    // Find matching file types (groups)
    for (const [name, group] of Object.entries(groups)) {
      if (group.enabled === false) continue;
      
      // Check if extension is in this file type's extension list
      const groupExtensions = group.extensions.split(',').map(ext => ext.trim().toLowerCase());
      if (groupExtensions.includes(extension)) {
        const fileTypeRule = {
          type: 'filetype',
          value: group.extensions,
          folder: group.folder,
          priority: parseFloat(group.priority) || 3.0,
          enabled: group.enabled !== false,
          overrideDomainRules: group.overrideDomainRules || false,
          source: 'filetype',
          groupName: name
        };
        
        // If overrideDomainRules is true, boost priority to beat domain rules
        if (fileTypeRule.overrideDomainRules && domainMatches.length > 0) {
          // Set priority to be lower than domain rules' priority (higher priority)
          const lowestDomainPriority = Math.min(...domainMatches.map(r => parseFloat(r.priority) || 2.0));
          fileTypeRule.priority = Math.max(0.1, lowestDomainPriority - 0.1);
        }
        
        fileTypeMatches.push(fileTypeRule);
      }
    }

    // 1. Collect ALL matching rules (domain + extension + file types)
    const allMatches = [
      ...domainMatches,
      ...extensionMatches,
      ...fileTypeMatches
    ];

    // 2. Sort by priority (lower number = higher priority)
    allMatches.sort((a, b) => {
      const priorityA = parseFloat(a.priority) || 2.0;
      const priorityB = parseFloat(b.priority) || 2.0;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // Same priority: domain > extension > filetype
      const order = { domain: 0, extension: 1, filetype: 2 };
      return (order[a.source] || 999) - (order[b.source] || 999);
    });

    // 3. Check for conflicts (multiple rules with same priority)
    let finalRule = null;
    if (allMatches.length === 0) {
      // No matches: use default folder
      finalRule = { folder: defaultFolder, source: 'default', priority: 999 };
    } else if (allMatches.length === 1) {
      finalRule = allMatches[0];
    } else {
      // Multiple matches - check priority conflicts
      const topPriority = parseFloat(allMatches[0].priority) || 2.0;
      const samePriorityRules = allMatches.filter(r => {
        const rPriority = parseFloat(r.priority) || 2.0;
        return Math.abs(rPriority - topPriority) < 0.01; // Float comparison with tolerance
      });

      if (samePriorityRules.length === 1) {
        finalRule = samePriorityRules[0];
      } else if (samePriorityRules.length > 1) {
        // Multiple rules with same priority
        if (conflictResolution === 'ask') {
          // Will be handled in overlay - store conflict rules
          finalRule = null; // Will set conflictRules in downloadInfo
        } else {
          // Auto-resolve: use first (already sorted by type)
          finalRule = samePriorityRules[0];
        }
      } else {
        // Shouldn't happen, but use first match
        finalRule = allMatches[0];
      }
    }

    // Handle conflict rules for "ask" mode
    const topPriority = allMatches.length > 0 ? parseFloat(allMatches[0].priority) || 2.0 : 999;
    const conflictRules = conflictResolution === 'ask' && allMatches.length > 1 ? 
      allMatches.filter(r => {
        const rPriority = parseFloat(r.priority) || 2.0;
        return Math.abs(rPriority - topPriority) < 0.01;
      }) : null;

    // Construct final file path using utility function to handle path normalization
    // Check if rule folder is an absolute path (requires post-download move via companion app)
    let resolvedPath;
    let needsAbsoluteMove = false;
    let absoluteDestination = null;
    
    if (finalRule) {
      if (isAbsolutePath(finalRule.folder)) {
        // Absolute path from native picker - download to Downloads root, then move
        resolvedPath = filename;  // Just filename for initial download
        needsAbsoluteMove = true;
        absoluteDestination = finalRule.folder;
      } else {
        // Relative path - build relative path for Chrome downloads API
        resolvedPath = buildRelativePath(finalRule.folder, downloadItem.filename);
      }
    } else if (conflictRules && conflictRules.length > 0) {
      // Use first conflict rule as default for path display, user will choose in overlay
      const defaultConflictRule = conflictRules[0];
      if (isAbsolutePath(defaultConflictRule.folder)) {
        resolvedPath = filename;
        needsAbsoluteMove = true;
        absoluteDestination = defaultConflictRule.folder;
      } else {
        resolvedPath = buildRelativePath(defaultConflictRule.folder, downloadItem.filename);
      }
    } else {
      // No rule matches - use default folder
      resolvedPath = buildRelativePath(defaultFolder, downloadItem.filename);
    }
    
    // Store download information for potential confirmation or later processing
    const downloadInfo = {
      id: downloadItem.id,
      filename: filename,
      extension: extension,
      domain: domain,
      url: url,
      resolvedPath: resolvedPath,
      originalSuggest: suggest, // Store the suggest callback for later use
      finalRule: finalRule,
      conflictRules: conflictRules, // NEW: For conflict resolution in overlay
      // Absolute path handling for post-download move
      needsMove: needsAbsoluteMove,
      absoluteDestination: absoluteDestination,
      useAbsolutePath: needsAbsoluteMove
    };
    
    // Track this download in the pending downloads map
    pendingDownloads.set(downloadItem.id, downloadInfo);

    // Handle confirmation flow based on user settings
    if (confirmationEnabled) {
      // Show confirmation overlay in the active tab
      // chrome.tabs.query: Queries Chrome tabs matching criteria
      //   Inputs: Query object {active: true, currentWindow: true}
      //   Outputs: Calls callback with array of matching tabs
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          // chrome.tabs.sendMessage: Sends message to content script in specified tab
          //   Inputs: tabId, message object with type and data
          //   Outputs: None (fire-and-forget message)
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'showDownloadOverlay',
            downloadInfo: downloadInfo
          });
        }
      });
      
      // Set up auto-save timeout if user doesn't interact with overlay
      // Store timeout ID so it can be cancelled when user interacts with overlay
      const timeoutId = setTimeout(() => {
        // Only proceed if download is still pending (not already handled)
        if (pendingDownloads.has(downloadItem.id)) {
          const pendingInfo = pendingDownloads.get(downloadItem.id);
          // CRITICAL: Check if timeout was paused by overlay - don't proceed if paused
          // This prevents auto-save when user is editing (even if Chrome loses focus)
          if (!pendingInfo.timeoutPaused) {
            // Double-check by querying content script to ensure no editor is visible
            // Send message to check editor state before proceeding
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'checkEditorState'
                }, (response) => {
                  // Only proceed if no editor is visible and timeout not paused
                  if (response && !response.hasEditor && !pendingInfo.timeoutPaused) {
                    proceedWithDownload(downloadItem.id);
                  }
                });
              } else {
                // No active tab - safe to proceed (user closed tab?)
                if (!pendingInfo.timeoutPaused) {
                  proceedWithDownload(downloadItem.id);
                }
              }
            });
          }
        }
      }, confirmationTimeout);
      
      // Store the timeout ID in the download info so it can be cancelled
      downloadInfo.timeoutId = timeoutId;
      downloadInfo.timeoutPaused = false;
      
    } else {
      // Proceed immediately without confirmation if disabled
      proceedWithDownload(downloadItem.id);
    }
  });
  return true; // Required for async suggest operations
});

/**
 * Message listener for communication with content scripts and popup.
 * Handles various operations requested by UI components.
 * 
 * Inputs:
 *   - message: Object containing message type and associated data
 *   - sender: Chrome runtime.MessageSender object with sender information
 *   - sendResponse: Function to send response back to sender (for async operations)
 * 
 * Outputs: Returns true for async operations, undefined otherwise
 * 
 * External Dependencies:
 *   - chrome.runtime API: For inter-component messaging
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Route messages to appropriate handler functions based on message type
  if (message.type === 'proceedWithDownload') {
    // Merge updated downloadInfo from content script into pendingDownloads
    // This ensures flags like useAbsolutePath are preserved
    let downloadInfo = pendingDownloads.get(message.downloadInfo.id);
    if (downloadInfo && downloadInfo.originalSuggest) {
      // Update existing downloadInfo with new values from content script
      Object.assign(downloadInfo, message.downloadInfo);
      // Cancel the auto-save timeout since user is taking action
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      }
      // proceedWithDownload: Processes and saves the download with specified path
      // Only call if originalSuggest is available (download hasn't started yet)
      proceedWithDownload(message.downloadInfo.id, message.downloadInfo.resolvedPath);
    } else {
      // DownloadInfo not in pendingDownloads - might have been removed or download completed
      // Check if download is still in progress by querying Chrome
      chrome.downloads.search({ id: message.downloadInfo.id }, (downloads) => {
        if (downloads && downloads.length > 0) {
          const download = downloads[0];
          if (download.state === 'complete') {
            // Download already completed - can't change path via originalSuggest, but can move file
            // Check if file needs to be moved to a different location
            if (message.downloadInfo.absoluteDestination) {
              // Normalize paths for comparison
              let currentPath = download.filename || '';
              const destPath = message.downloadInfo.absoluteDestination;
              
              // CRITICAL: Chrome's download.filename may be stale if file was already moved
              // We need to check if file actually exists at the reported location
              // If not, try common locations where it might have been moved
              // First, try to verify the file exists at the reported location
              // We'll use the companion app's verifyFolder functionality or just try the move
              // The moveFileNative function will handle file not found errors
              
              // Normalize destination path (ensure it ends with / if it's a folder)
              let finalDestPath = destPath;
              if (!destPath.endsWith('/') && !destPath.match(/\.[a-zA-Z0-9]+$/)) {
                // Looks like a folder path without trailing slash
                finalDestPath = destPath + '/';
              }
              
              // Extract folder paths for comparison
              const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
              const destDir = finalDestPath.endsWith('/') ? finalDestPath : finalDestPath.substring(0, finalDestPath.lastIndexOf('/') + 1);
              
              // Check if file is already in the destination folder
              if (currentDir === destDir || currentPath.startsWith(finalDestPath)) {
                // File is already in the correct location - show success notification
                const destParts = finalDestPath.split(/[/\\]/).filter(p => p);
                const destFolder = destParts[destParts.length - 1] || 'Downloads';
                chrome.notifications.create({
                  type: 'basic',
                  iconUrl: 'icons/icon128.png',
                  title: 'File Already Routed',
                  message: `${message.downloadInfo.filename} is already in ${destFolder}`
                });
                return;
              }
              
              // File needs to be moved - restore downloadInfo and move it
              pendingDownloads.set(message.downloadInfo.id, message.downloadInfo);
              
              // CRITICAL: Check if file already exists at destination before trying to move
              // Chrome's download.filename may be stale if file was already moved
              const filename = message.downloadInfo.filename;
              const possibleDestFile = finalDestPath.endsWith('/') ? 
                finalDestPath + filename : 
                finalDestPath;
              
              // Try to move - if source doesn't exist, check if file is already at destination
              moveFileNative(currentPath, finalDestPath).then((success) => {
                if (success) {
                  // Move succeeded
                  const destParts = finalDestPath.split(/[/\\]/).filter(p => p);
                  const destFolder = destParts[destParts.length - 1] || 'Downloads';
                  chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'File Routed Successfully',
                    message: `${message.downloadInfo.filename} moved to ${destFolder}`
                  });
                  pendingDownloads.delete(message.downloadInfo.id);
                } else {
                  // Move failed - file might not exist at source (already moved elsewhere)
                  // Check if file already exists at destination
                  // File doesn't exist at reported source - check if it's already at destination
                  // Use listFolders to check if file exists in destination folder
                  if (self.nativeMessagingClient && self.nativeMessagingClient.listFolders) {
                    self.nativeMessagingClient.listFolders(finalDestPath).then((items) => {
                      const fileExists = items && items.some(item => item.name === filename && item.type === 'file');
                      if (fileExists) {
                        // File is already at destination - success!
                        const destParts = finalDestPath.split(/[/\\]/).filter(p => p);
                        const destFolder = destParts[destParts.length - 1] || 'Downloads';
                        chrome.notifications.create({
                          type: 'basic',
                          iconUrl: 'icons/icon128.png',
                          title: 'File Already Routed',
                          message: `${filename} is already in ${destFolder}`
                        });
                      } else {
                        // File doesn't exist at source or destination - show error
                        chrome.notifications.create({
                          type: 'basic',
                          iconUrl: 'icons/icon128.png',
                          title: 'Routing Failed',
                          message: `Could not find ${filename}. File may have been deleted or moved.`
                        });
                      }
                      pendingDownloads.delete(message.downloadInfo.id);
                    }).catch((error) => {
                      // Check failed - show error
                      chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: 'Routing Failed',
                        message: `Could not verify file location for ${filename}`
                      });
                      pendingDownloads.delete(message.downloadInfo.id);
                    });
                  } else {
                    // Can't check - show error
                    chrome.notifications.create({
                      type: 'basic',
                      iconUrl: 'icons/icon128.png',
                      title: 'Routing Failed',
                      message: `Could not verify file location. Native messaging unavailable.`
                    });
                    pendingDownloads.delete(message.downloadInfo.id);
                  }
                }
              }).catch((error) => {
                console.error('Error moving file:', error);
                chrome.notifications.create({
                  type: 'basic',
                  iconUrl: 'icons/icon128.png',
                  title: 'Routing Failed',
                  message: `Error: ${error.message}`
                });
                pendingDownloads.delete(message.downloadInfo.id);
              });
            }
            return; // Download already completed, can't use originalSuggest
          } else {
            // Download still in progress but downloadInfo was lost
            // Restore it to pendingDownloads - but we've lost originalSuggest so can't change path
            // Best we can do is store it for post-download move
            // Note: originalSuggest is lost, so we can't change the download path now
            // Just restore downloadInfo so post-download move can work when download completes
            pendingDownloads.set(message.downloadInfo.id, message.downloadInfo);
          }
        }
      });
    }
  } else if (message.type === 'pauseDownloadTimeout') {
    // pauseDownloadTimeout: Pause auto-save timeout when user opens editor or folder picker
    const downloadInfo = pendingDownloads.get(message.downloadId);
    if (downloadInfo) {
      downloadInfo.timeoutPaused = true;
      // CRITICAL: Cancel the existing timeout immediately
      // This prevents it from firing even if Chrome loses focus
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      }
      console.log('Download timeout paused for:', message.downloadId);
    }
    sendResponse({ success: true });
  } else if (message.type === 'resumeDownloadTimeout') {
    // resumeDownloadTimeout: Resume auto-save timeout when user closes editor
    const downloadInfo = pendingDownloads.get(message.downloadId);
    if (downloadInfo) {
      downloadInfo.timeoutPaused = false;
      // Create a new timeout with remaining time or full timeout
      const timeoutMs = message.remainingTime || 5000;
      downloadInfo.timeoutId = setTimeout(() => {
        if (pendingDownloads.has(message.downloadId)) {
          const info = pendingDownloads.get(message.downloadId);
          if (!info.timeoutPaused) {
            proceedWithDownload(message.downloadId);
          }
        }
      }, timeoutMs);
      console.log('Download timeout resumed for:', message.downloadId, 'with', timeoutMs, 'ms');
    }
    sendResponse({ success: true });
  } else if (message.type === 'cancelDownloadTimeout') {
    // cancelDownloadTimeout: Cancel auto-save timeout entirely - no auto-save while editing
    const downloadInfo = pendingDownloads.get(message.downloadId);
    if (downloadInfo) {
      downloadInfo.timeoutPaused = true;
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      }
      console.log('Download timeout cancelled for:', message.downloadId);
    }
    sendResponse({ success: true });
  } else if (message.type === 'cancelDownload') {
    // cancelDownload: User clicked cancel/close button - cancel the download entirely
    const downloadId = message.downloadId;
    const downloadInfo = pendingDownloads.get(downloadId);
    if (downloadInfo) {
      // Cancel any pending timeout
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      }
      // Remove from pending downloads
      pendingDownloads.delete(downloadId);
    }
    // Cancel the download in Chrome
    chrome.downloads.cancel(downloadId, () => {
      if (chrome.runtime.lastError) {
        console.log('Download may have already completed:', chrome.runtime.lastError.message);
      }
    });
    sendResponse({ success: true });
  } else if (message.type === 'updatePendingDownloadInfo') {
    // updatePendingDownloadInfo: Update the pending download info when user changes rules in overlay
    // This ensures the countdown timer uses the updated rule when it fires
    const downloadId = message.downloadInfo.id;
    const downloadInfo = pendingDownloads.get(downloadId);
    if (downloadInfo) {
      // Update the downloadInfo with new values from content script
      Object.assign(downloadInfo, message.downloadInfo);
      console.log('[updatePendingDownloadInfo] Updated download', downloadId, 'with finalRule:', message.downloadInfo.finalRule);
    }
    sendResponse({ success: true });
  } else if (message.type === 'addRule') {
    // addRule: Adds or updates a routing rule in storage
    addRule(message.rule).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('addRule error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'addToGroup') {
    // addToGroup: Adds an extension to an existing file type group
    // Returns the group's folder so content script can update download destination
    addToGroup(message.extension, message.group).then((result) => {
      sendResponse(result);
    }).catch((error) => {
      console.error('addToGroup error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'showFallbackNotification') {
    // showFallbackNotification: Displays Chrome notification when overlay fails
    showFallbackNotification(message.downloadInfo);
    sendResponse({ success: true });
  } else if (message.type === 'getStats') {
    // getStats: Returns download statistics asynchronously
    // Must return true for async sendResponse operations
    getStats().then(stats => sendResponse(stats));
    return true; // Required for async sendResponse
  } else if (message.type === 'pickFolderNative') {
    // pickFolderNative: Request native folder picker from companion app
    pickFolderNative(message.startPath).then(path => {
      sendResponse({ success: true, path: path });
    }).catch(error => {
      console.error('pickFolderNative error:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to pick folder' 
      });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'checkCompanionApp') {
    // checkCompanionApp: Check if companion app is installed
    checkCompanionAppStatus().then(status => {
      sendResponse(status);
    }).catch(error => {
      sendResponse({
        installed: false,
        version: null,
        platform: null,
        lastChecked: Date.now(),
        checkInProgress: false,
        error: error.message
      });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'verifyFolderNative') {
    // verifyFolderNative: Verify folder exists using companion app
    verifyFolderNative(message.path).then(exists => {
      sendResponse({ success: true, exists: exists });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'moveFileNative') {
    // moveFileNative: Move file using companion app (post-download)
    moveFileNative(message.source, message.destination).then(success => {
      sendResponse({ success: success });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'useNativeSaveAs') {
    // useNativeSaveAs: User clicked Save As button - proceed download and show native Save As dialog
    console.log('useNativeSaveAs received for downloadId:', message.downloadId);
    const downloadInfo = pendingDownloads.get(message.downloadId);
    if (!downloadInfo) {
      console.error('Download info not found for useNativeSaveAs');
      sendResponse({ success: false, error: 'Download info not found' });
      return true;
    }
    
    // CRITICAL: Set saveAsRequested FIRST to prevent race condition
    // This must be set before any async operations to prevent auto-move
    downloadInfo.saveAsRequested = true;
    
    // Cancel timeout since user has taken action
    if (downloadInfo.timeoutId) {
      clearTimeout(downloadInfo.timeoutId);
      downloadInfo.timeoutId = null;
    }
    downloadInfo.timeoutPaused = true;
    
    // Check if download is already complete
    chrome.downloads.search({ id: message.downloadId }, (downloads) => {
      console.log('Download search result:', downloads?.[0]?.state, downloads?.[0]?.filename);
      if (downloads && downloads.length > 0 && downloads[0].state === 'complete') {
        // Store actual download path (handles Chrome renames like file (1).app)
        downloadInfo.actualDownloadPath = downloads[0].filename;
        downloadInfo.downloadComplete = true;
        
        // File already complete - determine correct source path
        let sourcePath = downloads[0].filename;
        
        // Check if file was already moved to absolute destination
        if (downloadInfo.fileMoved && downloadInfo.absoluteDestination) {
          console.log('File already moved, using absoluteDestination as source');
          sourcePath = downloadInfo.absoluteDestination;
        } else {
          // Use the actual path Chrome assigned (in case of rename)
          sourcePath = downloadInfo.actualDownloadPath;
        }
        
        console.log('Download complete, calling handleSaveAsDialog with source:', sourcePath);
        handleSaveAsDialog(message.downloadId, sourcePath).catch((err) => {
          console.error('handleSaveAsDialog error:', err);
        });
      } else {
        // File still downloading - proceed download first, then show dialog when complete
        console.log('Download not complete, setting pendingSaveAsDialog and proceeding');
        downloadInfo.pendingSaveAsDialog = true;
        proceedWithDownload(message.downloadId);
      }
    });
    
    sendResponse({ success: true });
    return true; // Required for async sendResponse
  } else if (message.type === 'openFolder') {
    // openFolder: Open folder containing the file
    const filePath = message.path;
    const downloadId = message.downloadId;
    
    if (!filePath && !downloadId) {
      sendResponse({ success: false, error: 'No file path or download ID provided' });
      return;
    }
    
    // Check if path is absolute (has drive letter on Windows or starts with /)
    const isAbsolutePath = filePath && (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('/'));
    
    // If we have an absolute path and companion app, use native explorer with /select
    if (isAbsolutePath && self.nativeMessagingClient && self.nativeMessagingClient.openFolder) {
      self.nativeMessagingClient.openFolder(filePath)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error opening folder via companion:', error);
          // Fall back to chrome.downloads.show if available
          if (downloadId) {
            chrome.downloads.show(downloadId);
            sendResponse({ success: true, method: 'chrome.downloads.show' });
          } else {
            sendResponse({ success: false, error: error.message });
          }
        });
    } else if (downloadId) {
      // Use Chrome's built-in show method - works without companion app
      // chrome.downloads.show: Opens the folder and selects the download file
      chrome.downloads.show(downloadId);
      sendResponse({ success: true, method: 'chrome.downloads.show' });
    } else {
      // No absolute path and no download ID - just open default downloads folder
      chrome.downloads.showDefaultFolder();
      sendResponse({ success: true, method: 'showDefaultFolder' });
    }
    return true; // Required for async sendResponse
  }
});

/**
 * Displays a fallback Chrome notification when overlay injection fails.
 * Provides action buttons for saving or changing download location.
 * 
 * Inputs:
 *   - downloadInfo: Object containing download metadata (id, filename, resolvedPath, etc.)
 * 
 * Outputs: None (creates notification via Chrome API)
 * 
 * External Dependencies:
 *   - chrome.notifications API: For creating system notifications
 */
function showFallbackNotification(downloadInfo) {
  // Generate unique notification ID for this download
  const notificationId = `download_${downloadInfo.id}`;
  
  // chrome.notifications.create: Creates a system notification with action buttons
  //   Inputs: notificationId (string), notification options object
  //   Outputs: Creates notification in Chrome's notification system
  const formattedPath = formatPathDisplay(downloadInfo.resolvedPath);
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Download Routing Confirmation',
    message: `Save ${downloadInfo.filename} to ${formattedPath}?`,
    buttons: [
      { title: 'Save Now' },
      { title: 'Change Location' }
    ],
    requireInteraction: true // Keep notification visible until user interacts
  });

  // Store download info with notification ID for button click handling
  pendingDownloads.set(notificationId, downloadInfo);
  
  // Auto-save after 10 seconds if user doesn't interact
  // setTimeout: Browser built-in function for delayed execution
  //   Inputs: callback function, delay in milliseconds (10000 = 10 seconds)
  //   Outputs: timeout ID (not stored as we don't need to cancel)
  setTimeout(() => {
    // Only proceed if notification still exists (not already handled)
    if (pendingDownloads.has(notificationId)) {
      proceedWithDownload(downloadInfo.id);
      // chrome.notifications.clear: Removes notification from system
      //   Inputs: notificationId (string)
      //   Outputs: Clears the notification
      chrome.notifications.clear(notificationId);
    }
  }, 10000);
}

/**
 * Handles clicks on notification action buttons.
 * Routes to appropriate action based on button clicked.
 * 
 * Inputs:
 *   - notificationId: String ID of the notification that was clicked
 *   - buttonIndex: Number index of the button (0 = first button, 1 = second, etc.)
 * 
 * Outputs: None
 * 
 * External Dependencies:
 *   - chrome.notifications API: For notification button click events
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  // Retrieve download info associated with this notification
  const downloadInfo = pendingDownloads.get(notificationId);
  if (!downloadInfo) return; // Exit if no matching download info found

  // Handle button clicks based on index
  if (buttonIndex === 0) {
    // First button: Save Now - proceed with download immediately
    proceedWithDownload(downloadInfo.id);
  } else if (buttonIndex === 1) {
    // Second button: Change Location - open options page for user to configure
    // chrome.runtime.openOptionsPage: Opens extension options page in new tab
    //   Inputs: None (optional callback)
    //   Outputs: Opens options.html page
    chrome.runtime.openOptionsPage();
  }
  
  // Clean up: remove notification and clear pending download tracking
  // chrome.notifications.clear: Removes notification from Chrome's notification center
  //   Inputs: notificationId (string)
  //   Outputs: Clears the notification
  chrome.notifications.clear(notificationId);
  pendingDownloads.delete(notificationId);
});

/**
 * Handles clicks on the notification body (not action buttons).
 * Proceeds with download immediately when notification is clicked.
 * 
 * Inputs:
 *   - notificationId: String ID of the notification that was clicked
 * 
 * Outputs: None
 * 
 * External Dependencies:
 *   - chrome.notifications API: For notification click events
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  // Retrieve download info and proceed if found
  const downloadInfo = pendingDownloads.get(notificationId);
  if (downloadInfo) {
    // Proceed with download immediately on notification body click
    proceedWithDownload(downloadInfo.id);
    // Clean up notification and tracking
    chrome.notifications.clear(notificationId);
    pendingDownloads.delete(notificationId);
  }
});

/**
 * Retrieves download statistics from local storage.
 * Provides data for the extension popup display.
 * 
 * Inputs: None
 * 
 * Outputs: Promise that resolves to stats object containing:
 *   - totalDownloads: Number of total downloads processed
 *   - routedDownloads: Number of downloads that were routed by rules
 *   - recentActivity: Array of recent download activity objects
 * 
 * External Dependencies:
 *   - chrome.storage.local API: For retrieving stored statistics
 */
async function getStats() {
  // Wrap Chrome storage API in Promise for async/await compatibility
  return new Promise((resolve) => {
    // chrome.storage.local.get: Retrieves data from local storage
    //   Inputs: Array of keys to retrieve ['downloadStats']
    //   Outputs: Calls callback with data object containing stored values
    chrome.storage.local.get(['downloadStats'], (data) => {
      // Return stats with defaults if none exist
      const stats = data.downloadStats || {
        totalDownloads: 0,
        routedDownloads: 0,
        recentActivity: []
      };
      resolve(stats);
    });
  });
}

/**
 * Listens for download state changes to update statistics.
 * Tracks when downloads complete to record them in activity history.
 * 
 * Inputs:
 *   - downloadDelta: Chrome downloads.DownloadDelta object with download change information
 * 
 * Outputs: None
 * 
 * External Dependencies:
 *   - chrome.downloads API: For monitoring download state changes
 */
chrome.downloads.onChanged.addListener(async (downloadDelta) => {
  // Only update stats when download transitions to 'complete' state
  // downloadDelta.state.current: Current state of the download
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    const downloadId = downloadDelta.id;
    const downloadInfo = pendingDownloads.get(downloadId);
    
    // Check if Save As dialog is pending
    if (downloadInfo && downloadInfo.pendingSaveAsDialog) {
      console.log('Download complete with pendingSaveAsDialog flag, showing Save As dialog');
      // Get the file path from the download
      const downloads = await chrome.downloads.search({ id: downloadId });
      if (downloads && downloads.length > 0 && downloads[0].filename) {
        // Store the actual download path for Save As (Chrome may have renamed file)
        downloadInfo.actualDownloadPath = downloads[0].filename;
        downloadInfo.downloadComplete = true;
        // Show Save As dialog now that download is complete
        handleSaveAsDialog(downloadId, downloads[0].filename).catch((err) => {
          console.error('handleSaveAsDialog error (from onChanged):', err);
        });
      }
      // Don't proceed with normal move logic - Save As dialog will handle it
      return;
    }
    
    // Check if user is waiting to use Save As - don't auto-move
    if (downloadInfo && downloadInfo.saveAsRequested) {
      console.log('Save As requested, skipping auto-move');
      // Store the actual download path
      const downloads = await chrome.downloads.search({ id: downloadId });
      if (downloads && downloads.length > 0 && downloads[0].filename) {
        downloadInfo.actualDownloadPath = downloads[0].filename;
        downloadInfo.downloadComplete = true;
      }
      return;
    }
    
    // Check if file needs to be moved to absolute path
    if (downloadInfo && downloadInfo.needsMove && downloadInfo.absoluteDestination) {
      try {
        // Get the actual download file path from Chrome
        // chrome.downloads.search: Searches for downloads matching criteria
        //   Inputs: Query object with id
        //   Outputs: Promise resolving to array of DownloadItem objects
        const downloads = await chrome.downloads.search({ id: downloadId });
        if (downloads && downloads.length > 0) {
          const downloadItem = downloads[0];
          const sourcePath = downloadItem.filename; // Full absolute path to downloaded file
          
          // Store actual download path before moving
          downloadInfo.actualDownloadPath = sourcePath;
          
          // Move file using companion app
          const moveResult = await moveFileNative(sourcePath, downloadInfo.absoluteDestination);
          
          if (moveResult && moveResult.moved) {
            const actualDestination = moveResult.destination || downloadInfo.absoluteDestination;
            console.log(`File moved: ${sourcePath} -> ${actualDestination}`);
            // Mark that file was moved so Save As knows correct source
            downloadInfo.fileMoved = true;
            downloadInfo.downloadComplete = true;
            // Store actual final destination (important for cross-device moves)
            downloadInfo.actualFinalDestination = actualDestination;
            
            const destParts = downloadInfo.absoluteDestination.split(/[/\\]/).filter(p => p);
            const destFolder = destParts[destParts.length - 1] || 'Downloads';
            // Update notification
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'File Routed Successfully',
              message: `${downloadInfo.filename} moved to ${destFolder}`
            });
          } else {
            console.error('Failed to move file to absolute destination');
            // Show error notification
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Routing Failed',
              message: `Could not move ${downloadInfo.filename}. File saved in Downloads folder.`
            });
          }
        }
      } catch (error) {
        console.error('Error during post-download file move:', error);
      }
    } else if (downloadInfo) {
      // For non-moved downloads, get the actual download path from Chrome
      try {
        const downloads = await chrome.downloads.search({ id: downloadId });
        if (downloads && downloads.length > 0 && downloads[0].filename) {
          // Store actual download path as the final destination
          downloadInfo.actualFinalDestination = downloads[0].filename;
          downloadInfo.actualDownloadPath = downloads[0].filename;
        }
      } catch (error) {
        console.error('Error getting download path:', error);
      }
    }
    
    // updateDownloadStats: Updates statistics with completed download information
    updateDownloadStats(downloadId);
    
    // Clean up pending download tracking after move completes (or if no move needed)
    if (downloadInfo) {
      pendingDownloads.delete(downloadId);
    }
  }
});

/**
 * Updates download statistics in local storage when a download completes.
 * Increments counters and adds entry to recent activity log.
 * 
 * Inputs:
 *   - downloadId: Number ID of the completed download
 * 
 * Outputs: None (updates Chrome storage)
 * 
 * External Dependencies:
 *   - chrome.storage.local API: For storing updated statistics
 */
function updateDownloadStats(downloadId) {
  // Find download info from pending downloads map using download ID
  // Array.from: Converts Map values iterator to array
  //   Inputs: Iterable (Map.values())
  //   Outputs: Array of values
  // find: Array method to locate first matching element
  //   Inputs: Predicate function
  //   Outputs: Matching element or undefined
  const downloadInfo = Array.from(pendingDownloads.values()).find(info => info.id === downloadId);
  if (!downloadInfo) return; // Exit if download info not found

  // Retrieve existing stats from local storage
  // chrome.storage.local.get: Retrieves data from local storage
  //   Inputs: Array of keys ['downloadStats']
  //   Outputs: Calls callback with data object
  chrome.storage.local.get(['downloadStats'], (data) => {
    // Initialize stats with defaults if none exist
    const stats = data.downloadStats || {
      totalDownloads: 0,
      routedDownloads: 0,
      recentActivity: []
    };

    // Increment total downloads counter
    stats.totalDownloads++;
    // Increment routed downloads counter if a rule was applied
    if (downloadInfo.finalRule) {
      stats.routedDownloads++;
    }

    // Add entry to recent activity log (most recent first)
    // unshift: Array method to add element to beginning of array
    //   Inputs: Element to add
    //   Outputs: New array length
    // Format folder path for display (store full path for activity display)
    // Use actual final destination if file was moved, otherwise use resolved path
    const actualPath = downloadInfo.actualFinalDestination || downloadInfo.resolvedPath;
    console.log('updateDownloadStats: Using actualPath:', actualPath, 'actualFinalDestination:', downloadInfo.actualFinalDestination, 'resolvedPath:', downloadInfo.resolvedPath);
    // Check for path separators (forward slash or backslash)
    // Note: In JS strings, '\\' represents a single backslash character
    const hasPathSeparator = actualPath.includes('/') || actualPath.includes('\\');
    const folderPath = hasPathSeparator
      ? actualPath.split(/[\\\\/]/).slice(0, -1).join('/') // Remove filename, normalize to forward slashes
      : 'Downloads';
    
    stats.recentActivity.unshift({
      filename: downloadInfo.filename,
      // Store download ID for chrome.downloads.show() fallback
      downloadId: downloadId,
      // Store actual file path after move (includes folder and filename)
      filePath: actualPath,
      // Store folder path for formatted display in popup
      folder: folderPath || 'Downloads',
      // Date.now: Returns current timestamp in milliseconds
      //   Inputs: None
      //   Outputs: Number (milliseconds since epoch)
      timestamp: Date.now(),
      // Convert finalRule to boolean (true if rule exists, false otherwise)
      routed: !!downloadInfo.finalRule
    });

    // Limit recent activity to last 10 entries for performance
    // slice: Array method to extract portion of array
    //   Inputs: start index (0), end index (10)
    //   Outputs: New array with first 10 elements
    stats.recentActivity = stats.recentActivity.slice(0, 10);

    // Save updated stats back to local storage
    // chrome.storage.local.set: Stores data in local storage
    //   Inputs: Object with key-value pairs to store
    //   Outputs: None (stores asynchronously)
    chrome.storage.local.set({ downloadStats: stats });
  });
}

/**
 * Proceeds with download by calling the suggest callback with final path.
 * Also displays a confirmation notification and cleans up tracking.
 * 
 * Inputs:
 *   - downloadId: Number ID of the download to process
 *   - customPath: Optional string path override (if user changed location)
 * 
 * Outputs: None (triggers download via Chrome API)
 * 
 * External Dependencies:
 *   - chrome.notifications API: For displaying completion notification
 */
function proceedWithDownload(downloadId, customPath = null) {
  // Retrieve download info from tracking map
  const downloadInfo = pendingDownloads.get(downloadId);
  if (!downloadInfo) {
    return; // Exit if download info not found
  }
  
  // Check if download already has absolute destination set (from rule matching or location change)
  // or if a custom path is being provided that's absolute
  const hasAbsoluteDestination = downloadInfo.absoluteDestination && downloadInfo.needsMove;
  const customPathIsAbsolute = customPath && /^(\/|[A-Za-z]:[\\\/])/.test(customPath);
  
  let absoluteDestinationPath = null;
  let finalPath;
  
  // Normalize and construct final path
  if (customPath) {
    // User provided a custom path - could be a folder name or full path
    if (customPathIsAbsolute) {
      // User provided an absolute path - download to Downloads, then move
      absoluteDestinationPath = customPath;
      finalPath = downloadInfo.filename; // Download to Downloads root
    } else {
      // Check if it contains path separators (relative path) or is just a folder name
      const normalizedCustomPath = normalizePath(customPath);
      if (normalizedCustomPath.includes('/')) {
        // User provided a relative path - normalize it
        finalPath = normalizedCustomPath;
      } else if (normalizedCustomPath && normalizedCustomPath !== downloadInfo.filename) {
        // User provided just a folder name - build relative path
        finalPath = buildRelativePath(normalizedCustomPath, downloadInfo.filename);
      } else {
        // Just filename - use as-is
        finalPath = downloadInfo.filename;
      }
    }
  } else if (hasAbsoluteDestination) {
    // Use the pre-set absolute destination (from rule matching or location change)
    absoluteDestinationPath = downloadInfo.absoluteDestination;
    finalPath = downloadInfo.filename; // Download to Downloads root
  } else {
    // Use resolved path from rules (relative path)
    finalPath = downloadInfo.resolvedPath || downloadInfo.filename;
  }
  
  // Store absolute destination for post-download move
  if (absoluteDestinationPath) {
    downloadInfo.absoluteDestination = absoluteDestinationPath;
    downloadInfo.needsMove = true;
  }
  
  // Call the original suggest callback to finalize download path
  // originalSuggest: Function passed from Chrome's onDeterminingFilename event
  //   Inputs: Object with filename and conflictAction
  //   Outputs: None (triggers download with specified path)
  // Only call if originalSuggest is available (download is still in determining filename phase)
  if (!downloadInfo.originalSuggest) {
    // Can't change download path - download already started or completed
    // If we need to move the file, check download state and move if complete
    if (absoluteDestinationPath && downloadInfo.needsMove) {
      chrome.downloads.search({ id: downloadId }, (downloads) => {
        if (downloads && downloads.length > 0 && downloads[0].state === 'complete') {
          // Download complete - move file now
          moveFileNative(downloads[0].filename, absoluteDestinationPath).then((success) => {
            if (success) {
              const destParts = absoluteDestinationPath.split(/[/\\]/).filter(p => p);
              const destFolder = destParts[destParts.length - 1] || 'Downloads';
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'File Routed Successfully',
                message: `${downloadInfo.filename} moved to ${destFolder}`
              });
            }
          });
        }
      });
    }
    return;
  }
  try {
    downloadInfo.originalSuggest({ 
      filename: finalPath, 
      conflictAction: 'uniquify' // Automatically rename if file already exists
    });
  } catch (error) {
    console.error('Error calling originalSuggest:', error);
  }
  
  // Display confirmation notification with formatted path
  // chrome.notifications.create: Creates system notification
  //   Inputs: Notification options object (creates with auto-generated ID if none provided)
  //   Outputs: Creates notification in Chrome's notification center
  const displayPath = absoluteDestinationPath || finalPath;
  // Check if absolute path (contains drive letter or starts with /)
  const isAbsolute = /^(\/|[A-Za-z]:\\)/.test(displayPath);
  let formattedPath;
  
  if (isAbsolute) {
    // For absolute paths, just show the folder name
    const parts = displayPath.split(/[/\\]/).filter(p => p);
    formattedPath = parts[parts.length - 1] || 'Downloads';
  } else {
    // For relative paths, format as breadcrumb
    formattedPath = formatPathDisplay(finalPath);
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Download Routed',
    message: `${downloadInfo.filename} saved to ${formattedPath}`
  });
  
  // Note: Don't delete from pendingDownloads yet - we need it for post-download move
  // It will be cleaned up after file move completes
}

/**
 * Adds or updates a routing rule in sync storage.
 * Updates existing rule if one with same type and value exists.
 * 
 * Inputs:
 *   - rule: Object containing rule properties:
 *     - type: String ('domain' or 'extension')
 *     - value: String (domain name or comma-separated extensions)
 *     - folder: String (target folder path)
 * 
 * Outputs: None (updates Chrome storage)
 * 
 * External Dependencies:
 *   - chrome.storage.sync API: For storing rules persistently across devices
 */
function addRule(rule) {
  return new Promise((resolve, reject) => {
    // Retrieve existing rules from sync storage
    // chrome.storage.sync.get: Retrieves data from sync storage (synced across Chrome instances)
    //   Inputs: Array of keys ['rules']
    //   Outputs: Calls callback with data object
    chrome.storage.sync.get(['rules'], (data) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      const rules = data.rules || [];
      
      // Check if rule with same type and value already exists
      // findIndex: Array method to find index of first matching element
      //   Inputs: Predicate function
      //   Outputs: Index number or -1 if not found
      const existingRuleIndex = rules.findIndex(r => 
        r.type === rule.type && r.value === rule.value
      );
      
      if (existingRuleIndex >= 0) {
        // Update existing rule at found index
        rules[existingRuleIndex] = rule;
      } else {
        // Add new rule to end of array
        // push: Array method to add element to end
        //   Inputs: Element to add
        //   Outputs: New array length
        rules.push(rule);
      }
      
      // Save updated rules back to sync storage
      // chrome.storage.sync.set: Stores data in sync storage
      //   Inputs: Object with key-value pairs
      //   Outputs: None (stores asynchronously)
      chrome.storage.sync.set({ rules }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Adds an extension to an existing file type group and creates/updates corresponding rule.
 * Updates the group's extension list and ensures a routing rule exists for it.
 * 
 * Inputs:
 *   - extension: String file extension (without dot, e.g. 'pdf')
 *   - groupName: String name of the group to add extension to
 * 
 * Outputs: None (updates Chrome storage)
 * 
 * External Dependencies:
 *   - chrome.storage.sync API: For storing groups and rules
 *   - getDefaultGroups: Function defined in this file to retrieve default group structure
 */
function addToGroup(extension, groupName) {
  // Retrieve groups from sync storage
  // chrome.storage.sync.get: Retrieves data from sync storage
  //   Inputs: Array of keys ['groups']
  //   Outputs: Promise resolving to data object
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['groups'], (data) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Load groups (use defaults if none exist)
      const groups = data.groups || getDefaultGroups();
      
      // Only proceed if group exists
      if (!groups[groupName]) {
        reject(new Error(`Group '${groupName}' not found`));
        return;
      }
      
      // Add extension to group's extension list if not already present
      // split: String method to split by delimiter into array
      //   Inputs: Delimiter string (',')
      //   Outputs: Array of strings
      // map: Array method to transform each element
      //   Inputs: Transform function
      //   Outputs: New array with transformed elements
      const extensions = groups[groupName].extensions.split(',').map(ext => ext.trim().toLowerCase());
      const extLower = extension.toLowerCase();
      
      // includes: Array method to check if element exists
      //   Inputs: Element to search for
      //   Outputs: Boolean
      if (!extensions.includes(extLower)) {
        extensions.push(extLower);
        // join: Array method to combine elements with delimiter
        //   Inputs: Delimiter string (',')
        //   Outputs: Combined string
        groups[groupName].extensions = extensions.join(',');
      }
      
      // Save updated groups to sync storage
      // NOTE: We only update the group's extensions list, NOT the rules.
      // The findMatchingRule function already iterates through groups and creates
      // filetype matches on the fly, so no separate rule is needed.
      // chrome.storage.sync.set: Stores data in sync storage
      //   Inputs: Object with key-value pairs
      //   Outputs: Promise resolving when saved
      chrome.storage.sync.set({ groups }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          // Return the group's folder so content script can use it for download
          resolve({
            success: true,
            folder: groups[groupName].folder,
            priority: groups[groupName].priority || 3.0,
            groupName: groupName
          });
        }
      });
    });
  });
}

/**
 * Returns default file type groups with predefined extensions and folders.
 * Provides sensible defaults for common file categories.
 * 
 * Inputs: None
 * 
 * Outputs: Object mapping group names to group objects, where each group contains:
 *   - extensions: String comma-separated list of file extensions
 *   - folder: String target folder name for this group
 */
function getDefaultGroups() {
  return {
    videos: {
      extensions: 'mp4,mov,mkv,avi,wmv,flv,webm',
      folder: 'Videos'
    },
    images: {
      extensions: 'jpg,jpeg,png,gif,bmp,svg,webp',
      folder: 'Images'
    },
    documents: {
      extensions: 'pdf,doc,docx,txt,rtf,odt',
      folder: 'Documents'
    },
    '3d-files': {
      extensions: 'stl,obj,3mf,step,stp,ply',
      folder: '3D Files'
    },
    archives: {
      extensions: 'zip,rar,7z,tar,gz',
      folder: 'Archives'
    },
    software: {
      extensions: 'exe,msi,dmg,deb,rpm,pkg',
      folder: 'Software'
    }
  };
}

/**
 * Checks companion app installation status and caches result.
 * 
 * Inputs: None
 * 
 * Outputs: Promise resolving to companion app status object
 * 
 * External Dependencies:
 *   - nativeMessagingClient: Native messaging client from lib/native-messaging-client.js
 */
async function checkCompanionAppStatus() {
  // Return cached status if checked recently (within 5 minutes)
  const now = Date.now();
  if (companionAppStatus.lastChecked > 0 && (now - companionAppStatus.lastChecked) < 300000) {
    return companionAppStatus;
  }

  // Prevent concurrent checks
  if (companionAppStatus.checkInProgress) {
    return companionAppStatus;
  }

  // Check if native messaging client is available
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.checkCompanionApp) {
    return {
      installed: false,
      version: null,
      platform: null,
      lastChecked: now,
      checkInProgress: false,
      error: 'Native messaging client not loaded'
    };
  }

  companionAppStatus.checkInProgress = true;

  try {
    // self.nativeMessagingClient.checkCompanionApp: Checks if companion app is installed
    const status = await self.nativeMessagingClient.checkCompanionApp();
    
    companionAppStatus = {
      installed: status.installed || false,
      version: status.version || null,
      platform: status.platform || null,
      lastChecked: now,
      checkInProgress: false,
      error: status.error || null
    };

    // Store status in local storage for popup/options access
    chrome.storage.local.set({ companionAppStatus: companionAppStatus });
  } catch (error) {
    companionAppStatus = {
      installed: false,
      version: null,
      platform: null,
      lastChecked: now,
      checkInProgress: false,
      error: error.message
    };
  }

  return companionAppStatus;
}

/**
 * Picks a folder using native OS dialog via companion app.
 * 
 * Inputs:
 *   - startPath: Optional string absolute path to start dialog at
 * 
 * Outputs: Promise resolving to selected absolute path string or null if cancelled
 * 
 * External Dependencies:
 *   - nativeMessagingClient: Native messaging client
 */
async function pickFolderNative(startPath = null) {
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.pickFolder) {
    throw new Error('Native messaging client not available');
  }
  
  try {
    const path = await self.nativeMessagingClient.pickFolder(startPath);
    // pickFolder returns null if user cancelled, or a string path if selected
    return path; // Can be null (cancelled) or string (selected path)
  } catch (error) {
    // Only throw if it's not a cancellation
    if (error.message && (error.message.includes('cancelled') || error.message.includes('CANCELLED'))) {
      return null; // User cancelled - return null instead of throwing
    }
    throw new Error(`Failed to pick folder: ${error.message}`);
  }
}

/**
 * Verifies if a folder exists using companion app.
 * 
 * Inputs:
 *   - folderPath: String absolute path to folder
 * 
 * Outputs: Promise resolving to boolean (true if exists)
 * 
 * External Dependencies:
 *   - nativeMessagingClient: Native messaging client
 */
async function verifyFolderNative(folderPath) {
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.verifyFolder) {
    return false;
  }
  
  try {
    return await self.nativeMessagingClient.verifyFolder(folderPath);
  } catch (error) {
    return false;
  }
}

/**
 * Moves a file using companion app (for post-download routing).
 * 
 * Inputs:
 *   - sourcePath: String absolute path to source file
 *   - destinationPath: String absolute path to destination
 * 
 * Outputs: Promise resolving to boolean (true if moved successfully)
 * 
 * External Dependencies:
 *   - nativeMessagingClient: Native messaging client
 */
async function moveFileNative(sourcePath, destinationPath) {
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.moveFile) {
    console.error('Native messaging client not available for file move');
    return { success: false, moved: false };
  }
  
  try {
    const result = await self.nativeMessagingClient.moveFile(sourcePath, destinationPath);
    return result;
  } catch (error) {
    console.error('Failed to move file:', error);
    return { success: false, moved: false };
  }
}

/**
 * Handles showing Save As dialog and moving file to selected location.
 * 
 * Inputs:
 *   - downloadId: Number ID of the download
 *   - sourceFilePath: String absolute path to source file (if already downloaded)
 * 
 * Outputs: Promise that resolves when dialog handling is complete
 */
async function handleSaveAsDialog(downloadId, sourceFilePath = null) {
  console.log('handleSaveAsDialog called:', downloadId, sourceFilePath);
  const downloadInfo = pendingDownloads.get(downloadId);
  if (!downloadInfo) {
    console.error('Download info not found for Save As dialog');
    return;
  }
  
  // Determine the correct source file path
  // Priority: 1) Moved file location, 2) Provided path, 3) Actual download path, 4) Chrome search
  let sourcePath = sourceFilePath;
  
  // CRITICAL: Check if file was moved by auto-routing AFTER Save As was requested
  // This handles race condition where auto-move happens between Save As click and dialog completion
  if (!downloadInfo.fileMoved) {
    // Re-check download state to see if file was moved while Save As dialog was open
    const downloads = await chrome.downloads.search({ id: downloadId });
    if (downloads && downloads.length > 0) {
      // If Chrome shows a different path than what we have, file may have been moved
      const chromePath = downloads[0].filename;
      if (downloadInfo.actualDownloadPath && chromePath !== downloadInfo.actualDownloadPath) {
        console.log('File path changed while Save As dialog was open:', downloadInfo.actualDownloadPath, '->', chromePath);
        // File was likely moved - check if we have the moved destination
        if (downloadInfo.absoluteDestination) {
          console.log('Using absoluteDestination as source (file moved during Save As)');
          sourcePath = downloadInfo.absoluteDestination;
          downloadInfo.fileMoved = true;
        }
      }
    }
  }
  
  // If file was already moved by auto-routing, use the destination as source
  if (downloadInfo.fileMoved && downloadInfo.absoluteDestination) {
    console.log('File was already moved, using absoluteDestination as source:', downloadInfo.absoluteDestination);
    sourcePath = downloadInfo.absoluteDestination;
  } else if (downloadInfo.actualDownloadPath) {
    // Use the actual path Chrome assigned (handles renames like file (1).app)
    console.log('Using actualDownloadPath as source:', downloadInfo.actualDownloadPath);
    sourcePath = downloadInfo.actualDownloadPath;
  } else if (!sourcePath) {
    // Fall back to Chrome search
    const downloads = await chrome.downloads.search({ id: downloadId });
    if (!downloads || downloads.length === 0 || !downloads[0].filename) {
      console.error('Could not find download file path');
      // Notify user of error
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Save As Failed',
        message: 'Could not find downloaded file'
      });
      return;
    }
    sourcePath = downloads[0].filename;
    console.log('Got source path from Chrome search:', sourcePath);
  }
  
  // Get default directory from routing rules
  const defaultDirectory = await getDefaultSaveAsDirectory(downloadInfo);
  
  // Show Save As dialog via companion app
  // Pass null for defaultDirectory if empty (companion app will use Downloads)
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.showSaveAsDialog) {
    console.error('Native messaging client not available for Save As dialog');
    // Fallback: show notification that file was saved to default location
    const formattedPath = formatPathDisplay(downloadInfo.resolvedPath, downloadInfo.absoluteDestination);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'File Saved',
      message: `${downloadInfo.filename} saved to ${formattedPath}`
    });
    // Clean up
    pendingDownloads.delete(downloadId);
    return;
  }
  
  try {
    // Update overlay to show "Choose save location..."
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'saveAsDialogOpening',
          downloadId: downloadId
        }).catch(() => {
          // Ignore errors if tab doesn't have content script
        });
      }
    });
    
    console.log('Calling showSaveAsDialog with:', downloadInfo.filename, defaultDirectory);
    console.log('nativeMessagingClient available:', !!self.nativeMessagingClient, 'showSaveAsDialog method:', !!self.nativeMessagingClient?.showSaveAsDialog);
    
    let selectedFilePath;
    try {
      selectedFilePath = await self.nativeMessagingClient.showSaveAsDialog(
        downloadInfo.filename,
        defaultDirectory || null
      );
      console.log('showSaveAsDialog returned:', selectedFilePath);
    } catch (dialogError) {
      console.error('showSaveAsDialog threw error:', dialogError.message);
      // If the error is connection-related, show notification and clean up
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Save As Failed',
        message: 'Could not open Save As dialog. File saved to default location.'
      });
      // Close overlay
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'closeOverlay',
            downloadId: downloadId
          }).catch(() => {});
        }
      });
      pendingDownloads.delete(downloadId);
      return;
    }
    
    if (!selectedFilePath) {
      // User cancelled - file stays in default location
      const formattedPath = formatPathDisplay(downloadInfo.resolvedPath, downloadInfo.absoluteDestination);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'File Saved to Default Location',
        message: `${downloadInfo.filename} saved to ${formattedPath}`
      });
      
      // Close overlay
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'closeOverlay',
            downloadId: downloadId
          }).catch(() => {});
        }
      });
      
      // Clean up
      pendingDownloads.delete(downloadId);
      return;
    }
    
    // Move file to selected location
    console.log('Moving file from:', sourcePath, 'to:', selectedFilePath);
    console.log('downloadInfo state:', {
      downloadComplete: downloadInfo.downloadComplete,
      fileMoved: downloadInfo.fileMoved,
      actualDownloadPath: downloadInfo.actualDownloadPath
    });
    
    // Verify download is complete (or was already moved)
    const downloads = await chrome.downloads.search({ id: downloadId });
    console.log('Chrome download state:', downloads?.[0]?.state);
    
    const downloadComplete = downloadInfo.downloadComplete || 
                             downloadInfo.fileMoved || 
                             (downloads && downloads.length > 0 && downloads[0].state === 'complete');
    
    console.log('downloadComplete check result:', downloadComplete);
    
    if (downloadComplete) {
      // Wait a bit to ensure file is fully written and previous native messaging call completed
      // This prevents connection issues when making rapid sequential native messaging calls
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify native messaging client is still available
      if (!self.nativeMessagingClient) {
        console.error('Native messaging client not available for file move');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Save Failed',
          message: 'Companion app connection lost. Please try again.'
        });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'saveAsComplete',
              downloadId: downloadId,
              success: false
            }).catch(() => {});
          }
        });
        pendingDownloads.delete(downloadId);
        return;
      }
      
      console.log('About to call moveFileNative from:', sourcePath, 'to:', selectedFilePath);
      
      // Verify source file exists before attempting move
      // If file was moved by auto-routing, it should exist at absoluteDestination
      // The moveFile service will also check, but we provide better error handling here
      const moveResult = await moveFileNative(sourcePath, selectedFilePath);
      console.log('moveFileNative result:', moveResult);
      
      if (moveResult && moveResult.moved) {
        const actualFinalPath = moveResult.destination || selectedFilePath;
        // Store the actual final destination for stats recording
        downloadInfo.actualFinalDestination = actualFinalPath;
        
        // Show success notification
        const destParts = selectedFilePath.replace(/\\/g, '/').split('/').filter(p => p);
        const destFolder = destParts.length > 1 ? destParts[destParts.length - 2] : 'selected location';
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'File Saved Successfully',
          message: `${downloadInfo.filename} saved to ${destFolder}`
        });
        
        // Update download stats with the actual final destination
        updateDownloadStats(downloadId);
        
        // Close overlay with success message
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'saveAsComplete',
              downloadId: downloadId,
              success: true,
              filePath: actualFinalPath
            }).catch(() => {});
          }
        });
      } else {
        // Move failed - check if file was moved to default location
        let errorMessage = `Could not move ${downloadInfo.filename}`;
        if (downloadInfo.fileMoved && downloadInfo.absoluteDestination) {
          errorMessage = `Could not move ${downloadInfo.filename}. File is at: ${downloadInfo.absoluteDestination}`;
        } else {
          errorMessage = `Could not move ${downloadInfo.filename}. File may have been moved or deleted.`;
        }
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Save Failed',
          message: errorMessage
        });
        
        // Close overlay with error message
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'saveAsComplete',
              downloadId: downloadId,
              success: false
            }).catch(() => {});
          }
        });
      }
    } else {
      // Download not complete - this shouldn't happen, but handle gracefully
      console.error('Download not complete when trying to move file');
      console.error('Download state details:', {
        downloadInfo: {
          downloadComplete: downloadInfo.downloadComplete,
          fileMoved: downloadInfo.fileMoved,
          actualDownloadPath: downloadInfo.actualDownloadPath
        },
        chromeDownloadState: downloads?.[0]?.state
      });
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Save As Failed',
        message: 'Download is still in progress. Please try again when it completes.'
      });
      
      // Still close overlay and clean up
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'saveAsComplete',
            downloadId: downloadId,
            success: false
          }).catch(() => {});
        }
      });
    }
    
    // Clean up
    pendingDownloads.delete(downloadId);
  } catch (error) {
    console.error('Error in Save As dialog flow:', error);
    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Save As Failed',
      message: error.message || 'An error occurred while showing Save As dialog'
    });
    
    // Close overlay
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'closeOverlay',
          downloadId: downloadId
        }).catch(() => {});
      }
    });
    
    // Clean up
    pendingDownloads.delete(downloadId);
  }
}

// Check companion app status on extension startup
chrome.runtime.onStartup.addListener(() => {
  checkCompanionAppStatus();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  checkCompanionAppStatus();
  
  // Migration: Add priority fields to existing rules and groups
  if (details.reason === 'update' || details.reason === 'install') {
    try {
      const { rules, groups } = await chrome.storage.sync.get(['rules', 'groups']);
      
      let needsMigration = false;
      
      // Migrate rules: Add default priority 2.0 and enabled flag
      const migratedRules = (rules || []).map(r => {
        if (r.priority === undefined || r.enabled === undefined) {
          needsMigration = true;
          return {
            ...r,
            priority: r.priority !== undefined ? parseFloat(r.priority) : 2.0,
            enabled: r.enabled !== false
          };
        }
        return r;
      });
      
      // Migrate groups: Add priority 3.0, override flag, and enabled flag
      const migratedGroups = {};
      for (const [name, group] of Object.entries(groups || {})) {
        if (group.priority === undefined || group.overrideDomainRules === undefined || group.enabled === undefined) {
          needsMigration = true;
          migratedGroups[name] = {
            ...group,
            priority: group.priority !== undefined ? parseFloat(group.priority) : 3.0,
            overrideDomainRules: group.overrideDomainRules || false,
            enabled: group.enabled !== false
          };
        } else {
          migratedGroups[name] = group;
        }
      }
      
      // Only save if migration was needed
      if (needsMigration) {
        await chrome.storage.sync.set({ 
          rules: migratedRules, 
          groups: migratedGroups
        });
        console.log('Migrated rules and groups to priority system');
      }
      
      // Ensure defaultFolder setting exists
      const { defaultFolder, conflictResolution } = await chrome.storage.sync.get(['defaultFolder', 'conflictResolution']);
      if (!defaultFolder || conflictResolution === undefined) {
        await chrome.storage.sync.set({
          defaultFolder: defaultFolder || 'Downloads',
          conflictResolution: conflictResolution || 'auto'
        });
      }
    } catch (error) {
      console.error('Migration error:', error);
    }
  }
});

// Initial check
checkCompanionAppStatus();
