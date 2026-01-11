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
 */
function formatPathDisplay(relativePath) {
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
  chrome.storage.sync.get(['rules', 'tieBreaker', 'confirmationEnabled', 'confirmationTimeout'], (data) => {
    // Load configuration with sensible defaults
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';
    const confirmationEnabled = data.confirmationEnabled !== false; // Default to true
    const confirmationTimeout = data.confirmationTimeout || 5000; // Default 5 seconds
    
    // Extract download metadata
    const url = downloadItem.url;
    // Extract just the filename from downloadItem.filename (which may contain a path)
    const filename = extractFilename(downloadItem.filename);
    // Extract file extension from filename (last part after final dot, lowercase)
    const extension = filename.split('.').pop().toLowerCase();

    // Initialize rule matching arrays
    let domainMatches = [];
    let extensionMatches = [];
    let domain = 'unknown';

    // Extract domain from URL and find matching domain rules
    // new URL(): Browser built-in constructor to parse URLs
    //   Inputs: URL string
    //   Outputs: URL object with hostname property
    try {
      domain = new URL(url).hostname;
      // Filter rules where type is 'domain' and domain contains the rule value
      domainMatches = rules.filter(rule => rule.type === 'domain' && domain.includes(rule.value));
    } catch (e) {
      console.error("Invalid URL, cannot determine domain:", url);
    }
    
    // Find matching extension rules by checking if file extension is in rule's extension list
    // Split comma-separated extensions and trim whitespace for comparison
    extensionMatches = rules.filter(rule => rule.type === 'extension' && rule.value.split(',').map(ext => ext.trim()).includes(extension));

    // Determine which rule to apply based on priority and tie-breaker settings
    let finalRule = null;

    // Apply tie-breaker logic when both domain and extension rules match
    if (domainMatches.length > 0 && extensionMatches.length > 0) {
      if (tieBreaker === 'domain') {
        finalRule = domainMatches[0];
      } else if (tieBreaker === 'extension') {
        finalRule = extensionMatches[0];
      } else {
        // "Ask" logic will be handled in the confirmation prompt
        // Default to domain rule for now
        finalRule = domainMatches[0]; 
      }
    } else if (domainMatches.length > 0) {
      // Only domain rules match
      finalRule = domainMatches[0];
    } else if (extensionMatches.length > 0) {
      // Only extension rules match
      finalRule = extensionMatches[0];
    }

    // Construct final file path using utility function to handle path normalization
    // Pass original downloadItem.filename to extractFilename inside buildRelativePath
    const resolvedPath = finalRule 
      ? buildRelativePath(finalRule.folder, downloadItem.filename)  // Pass original for proper extraction
      : extractFilename(downloadItem.filename);  // Just filename if no rule matches
    
    // Store download information for potential confirmation or later processing
    const downloadInfo = {
      id: downloadItem.id,
      filename: filename,
      extension: extension,
      domain: domain,
      url: url,
      resolvedPath: resolvedPath,
      originalSuggest: suggest, // Store the suggest callback for later use
      finalRule: finalRule
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
      // setTimeout: Browser built-in function to execute code after delay
      //   Inputs: callback function, delay in milliseconds
      //   Outputs: timeout ID (not stored here as we don't need to cancel)
      setTimeout(() => {
        // Only proceed if download is still pending (not already handled)
        if (pendingDownloads.has(downloadItem.id)) {
          proceedWithDownload(downloadItem.id);
        }
      }, confirmationTimeout);
      
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
    const downloadInfo = pendingDownloads.get(message.downloadInfo.id);
    if (downloadInfo) {
      Object.assign(downloadInfo, message.downloadInfo);
    }
    // proceedWithDownload: Processes and saves the download with specified path
    proceedWithDownload(message.downloadInfo.id, message.downloadInfo.resolvedPath);
  } else if (message.type === 'addRule') {
    // addRule: Adds or updates a routing rule in storage
    addRule(message.rule);
  } else if (message.type === 'addToGroup') {
    // addToGroup: Adds an extension to an existing file type group
    addToGroup(message.extension, message.group);
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
          
          // Move file using companion app
          const moveSuccess = await moveFileNative(sourcePath, downloadInfo.absoluteDestination);
          
          if (moveSuccess) {
            console.log(`File moved: ${sourcePath} -> ${downloadInfo.absoluteDestination}`);
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
    const folderPath = downloadInfo.resolvedPath.includes('/') 
      ? downloadInfo.resolvedPath.split('/').slice(0, -1).join('/') // Remove filename
      : 'Downloads';
    
    stats.recentActivity.unshift({
      filename: downloadInfo.filename,
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
  if (!downloadInfo) return; // Exit if download info not found
  
  // Check if this is an absolute path that requires post-download move
  const isAbsolutePath = downloadInfo.useAbsolutePath || 
    (customPath && /^(\/|[A-Za-z]:\\)/.test(customPath)) ||
    (downloadInfo.resolvedPath && /^(\/|[A-Za-z]:\\)/.test(downloadInfo.resolvedPath));
  
  let absoluteDestinationPath = null;
  let finalPath;
  
  // Normalize and construct final path
  if (customPath) {
    // User provided a custom path - could be a folder name or full path
    // Check if it contains path separators (full path) or is just a folder name
    const normalizedCustomPath = normalizePath(customPath);
    if (/^(\/|[A-Za-z]:\\)/.test(customPath)) {
      // User provided an absolute path - download to Downloads, then move
      absoluteDestinationPath = customPath;
      finalPath = downloadInfo.filename; // Download to Downloads root
    } else if (normalizedCustomPath.includes('/')) {
      // User provided a relative path - normalize it
      finalPath = normalizedCustomPath;
    } else {
      // User provided just a folder name - build relative path
      finalPath = buildRelativePath(normalizedCustomPath, downloadInfo.filename);
    }
  } else {
    // Use resolved path from rules
    if (isAbsolutePath && downloadInfo.resolvedPath) {
      // Absolute path from native picker - download to Downloads, then move
      absoluteDestinationPath = downloadInfo.resolvedPath;
      finalPath = downloadInfo.filename; // Download to Downloads root
    } else {
      // Relative path - use as-is
      finalPath = downloadInfo.resolvedPath;
    }
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
  downloadInfo.originalSuggest({ 
    filename: finalPath, 
    conflictAction: 'uniquify' // Automatically rename if file already exists
  });
  
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
  // Retrieve existing rules from sync storage
  // chrome.storage.sync.get: Retrieves data from sync storage (synced across Chrome instances)
  //   Inputs: Array of keys ['rules']
  //   Outputs: Calls callback with data object
  chrome.storage.sync.get(['rules'], (data) => {
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
    chrome.storage.sync.set({ rules });
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
  // Retrieve groups and rules from sync storage
  // chrome.storage.sync.get: Retrieves data from sync storage
  //   Inputs: Array of keys ['groups', 'rules']
  //   Outputs: Calls callback with data object
  chrome.storage.sync.get(['groups', 'rules'], (data) => {
    // Load groups (use defaults if none exist) and rules
    const groups = data.groups || getDefaultGroups();
    const rules = data.rules || [];
    
    // Only proceed if group exists
    if (groups[groupName]) {
      // Add extension to group's extension list if not already present
      // split: String method to split by delimiter into array
      //   Inputs: Delimiter string (',')
      //   Outputs: Array of strings
      // map: Array method to transform each element
      //   Inputs: Transform function
      //   Outputs: New array with transformed elements
      const extensions = groups[groupName].extensions.split(',').map(ext => ext.trim());
      // includes: Array method to check if element exists
      //   Inputs: Element to search for
      //   Outputs: Boolean
      if (!extensions.includes(extension)) {
        extensions.push(extension);
        // join: Array method to combine elements with delimiter
        //   Inputs: Delimiter string (',')
        //   Outputs: Combined string
        groups[groupName].extensions = extensions.join(',');
      }
      
      // Find existing extension rule that includes this extension
      const existingRuleIndex = rules.findIndex(r => 
        r.type === 'extension' && r.value.includes(extension)
      );
      
      if (existingRuleIndex >= 0) {
        // Update existing rule with new extension list and folder
        rules[existingRuleIndex].value = groups[groupName].extensions;
        rules[existingRuleIndex].folder = groups[groupName].folder;
      } else {
        // Create new extension rule for this group
        rules.push({
          type: 'extension',
          value: groups[groupName].extensions,
          folder: groups[groupName].folder
        });
      }
      
      // Save updated groups and rules to sync storage
      // chrome.storage.sync.set: Stores data in sync storage
      //   Inputs: Object with key-value pairs
      //   Outputs: None (stores asynchronously)
      chrome.storage.sync.set({ groups, rules });
    }
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
    return path;
  } catch (error) {
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
    return false;
  }
  
  try {
    return await self.nativeMessagingClient.moveFile(sourcePath, destinationPath);
  } catch (error) {
    console.error('Failed to move file:', error);
    return false;
  }
}

// Check companion app status on extension startup
chrome.runtime.onStartup.addListener(() => {
  checkCompanionAppStatus();
});

chrome.runtime.onInstalled.addListener(() => {
  checkCompanionAppStatus();
});

// Initial check
checkCompanionAppStatus();
