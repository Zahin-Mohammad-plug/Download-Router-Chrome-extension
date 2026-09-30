/**
 * background.js
 * 
 * Purpose: Service worker for the Download Router Chrome extension.
 * Role: Handles download interception, routing logic, rule matching, notification management,
 *       and statistics tracking. Acts as the core backend service for the extension.
 * 
 * Key Responsibilities:
 * - Intercept downloads and determine target folders based on rules
 * - Match downloads against domain, contains (filename pattern), and file type rules
 * - Manage download confirmation overlays and fallback notifications
 * - Track download statistics and activity history
 * - Handle rule and group management operations
 * - Communicate with companion app via Native Messaging API
 */

// Verbose logging (file names and paths) is off in release builds.
// Turn on from the service worker console with: self.DR_DEBUG = true
const debugLog = (...args) => { if (self.DR_DEBUG) console.log(...args); };

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

// Map to track completed downloads for notification clicks
let completedDownloads = new Map();

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
 *   - "Folder..name" → "Folder..name" (only a bare ".." segment is rejected)
 *   - "Report. " → "Report" (Windows drops trailing dots/spaces)
 *   - "CON" → "_CON" (Windows reserved device name)
 *   - "My Files" → "My Files" (spaces preserved)
 */
function sanitizeFolderName(folder) {
  if (!folder) return '';
  let clean = folder
    .replace(/[<>:"|?*\\\x00-\x1f]/g, '')  // Remove characters invalid on Windows/macOS and control chars
    .trim()
    .replace(/[. ]+$/, '');  // Windows silently strips trailing dots and spaces
  if (/^\.+$/.test(clean)) return '';  // "." and ".." would escape the Downloads folder
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(clean)) {
    clean = '_' + clean;  // Reserved device names can't be folders on Windows
  }
  return clean;
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
  // Windows drive letter (C:\) or UNC share (\\server\share)
  if (/^([A-Za-z]:[\\\/]|\\\\[^\\])/.test(path)) return true;
  // Unix paths only count as absolute when they start at a real system root.
  // A typed "/Videos" is treated as the "Videos" subfolder of Downloads instead.
  return /^\/(Users|Volumes|home|mnt|media|tmp|private|opt|var|srv|run|Applications|Library|System)(\/|$)/.test(path);
}

/**
 * Collects all folder paths currently used in rules, groups, and default folder.
 * Returns only relative paths (filters out absolute paths).
 * 
 * Inputs: None
 * Outputs: Promise resolving to sorted array of normalized folder paths (forward slashes)
 */
async function getFolderSuggestions() {
  const [{ downloadStats }, used] = await Promise.all([
    chrome.storage.local.get(['downloadStats']),
    getAllUsedFolderPaths()
  ]);
  const counts = new Map();
  const order = [];
  for (const entry of (downloadStats && downloadStats.recentActivity) || []) {
    const folder = entry.folder && !isAbsolutePath(entry.folder) ? entry.folder : null;
    if (!folder) continue;
    if (!counts.has(folder)) order.push(folder);
    counts.set(folder, (counts.get(folder) || 0) + 1);
  }
  for (const folder of used) {
    if (!counts.has(folder)) { order.push(folder); counts.set(folder, 0); }
  }
  if (!counts.has('Downloads')) order.push('Downloads');
  return order.map(path => ({ path, count: counts.get(path) || 0 }));
}

async function getAllUsedFolderPaths() {
  const data = await chrome.storage.sync.get(['rules', 'groups', 'defaultFolder']);
  const paths = new Set();
  
  // Add paths from rules
  if (data.rules && Array.isArray(data.rules)) {
    data.rules.forEach(rule => {
      if (rule.folder && !isAbsolutePath(rule.folder)) {
        paths.add(rule.folder.replace(/\\/g, '/'));
      }
    });
  }
  
  // Add paths from groups
  if (data.groups && typeof data.groups === 'object') {
    Object.values(data.groups).forEach(group => {
      if (group.folder && !isAbsolutePath(group.folder)) {
        paths.add(group.folder.replace(/\\/g, '/'));
      }
    });
  }
  
  // Add default folder
  if (data.defaultFolder && !isAbsolutePath(data.defaultFolder)) {
    paths.add(data.defaultFolder.replace(/\\/g, '/'));
  }
  
  return Array.from(paths).sort();
}

/**
 * Matches a URL against a rule with support for domains and paths
 * Rule "github.com" matches "github.com" and "api.github.com" but NOT "hub.com"
 * Rule "github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension"
 *   matches URLs from that path and subpaths
 *
 * Inputs:
 *   - downloadUrl: String full URL from download
 *   - ruleValue: String domain or domain/path from rule
 *
 * Outputs: Boolean true if URL matches rule
 */
function matchesDomainRule(downloadUrl, ruleValue) {
  if (!downloadUrl || !ruleValue) return false;

  // Extract domain and path from download URL (hostname never includes the port)
  let downloadDomain = '';
  let downloadPath = '';
  try {
    const url = new URL(downloadUrl);
    downloadDomain = url.hostname;
    downloadPath = url.pathname;
  } catch (e) {
    return false;
  }

  // Normalize download domain (remove www)
  downloadDomain = downloadDomain.replace(/^www\./, '').toLowerCase();

  const { domain: ruleDomain, path: rulePath } = parseDomainRuleValue(ruleValue);
  if (!ruleDomain) return false;

  // Check domain match
  const domainMatches =
    downloadDomain === ruleDomain ||  // Exact match
    downloadDomain.endsWith('.' + ruleDomain);  // Subdomain match

  if (!domainMatches) return false;

  // If rule has a path, match whole path segments (case-insensitive)
  // "github.com/org/repo" matches /org/repo and /org/repo/releases, not /org/repo-other
  if (rulePath) {
    const rulePathLower = rulePath.toLowerCase();
    const downloadPathLower = downloadPath.toLowerCase();
    return downloadPathLower === rulePathLower || downloadPathLower.startsWith(rulePathLower + '/');
  }

  // No path in rule, domain match is enough
  return true;
}

/**
 * Splits a domain rule value into a normalized domain and optional path.
 * Strips protocol, www., port, trailing slashes, query and hash.
 *
 * Inputs:
 *   - ruleValue: String like "https://www.github.com:443/org/repo/"
 *
 * Outputs: Object { domain: "github.com", path: "/org/repo" }
 */
function parseDomainRuleValue(ruleValue) {
  let normalized = String(ruleValue || '').trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^www\./i, '');

  const slashIndex = normalized.indexOf('/');
  const host = slashIndex === -1 ? normalized : normalized.substring(0, slashIndex);
  const path = slashIndex === -1 ? '' : normalized.substring(slashIndex);

  return { domain: host.split(':')[0].toLowerCase(), path };
}

/**
 * Extracts a lowercase file extension, handling names without a dot.
 *
 * Examples: "a.PDF" → "pdf", "README" → "", ".bashrc" → "bashrc"
 */
function getFileExtension(filename) {
  const name = extractFilename(filename || '');
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.substring(dot + 1).toLowerCase();
}

/**
 * Splits a comma-separated list into trimmed, lowercase, non-empty items.
 * Leading dots are removed so ".pdf, docx" and "pdf,docx" behave the same.
 */
function splitList(value, { stripDots = false } = {}) {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .map(item => stripDots ? item.replace(/^\.+/, '') : item)
    .filter(item => item.length > 0);
}

/**
 * Parses a rule/group priority, keeping 0 as a valid value.
 */
function parsePriority(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Tiebreak order when priorities are equal: domain > contains > extension > filetype
const RULE_SOURCE_ORDER = { domain: 0, contains: 1, extension: 2, filetype: 3 };

/**
 * Compares two matched rules: priority first, then rule type, then the more
 * specific domain rule (e.g. "github.com/org/repo" beats "github.com").
 */
function compareMatchedRules(a, b) {
  const priorityA = parsePriority(a.priority, 2.0);
  const priorityB = parsePriority(b.priority, 2.0);
  if (Math.abs(priorityA - priorityB) >= 0.01) {
    return priorityA - priorityB;
  }
  const orderA = RULE_SOURCE_ORDER[a.source] ?? 999;
  const orderB = RULE_SOURCE_ORDER[b.source] ?? 999;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  if (a.source === 'domain' && b.source === 'domain') {
    return String(b.value || '').length - String(a.value || '').length;
  }
  return 0;
}

/**
 * Evaluates all rules and file type groups for a download and picks a destination.
 * Shared by the download handler and overlay re-evaluation so both behave identically.
 *
 * Inputs:
 *   - download: { url, referrer, filename }
 *   - settings: { rules, groups, conflictResolution, defaultFolder }
 *
 * Outputs: Object { domain, extension, allMatches, finalRule, conflictRules }
 *   finalRule is null only when conflictResolution is 'ask' and there is a tie.
 */
function computeRoute(download, settings) {
  const rules = Array.isArray(settings.rules) ? settings.rules : [];
  const groups = settings.groups || {};
  const conflictResolution = settings.conflictResolution || 'auto';
  const defaultFolder = settings.defaultFolder || 'Downloads';

  const url = download.url || '';
  const referrer = download.referrer || '';
  const filename = extractFilename(download.filename || '');
  const filenameLower = filename.toLowerCase();
  const extension = getFileExtension(filename);

  // Determine the domain: download URL, then blob origin, then referrer
  let domain = 'unknown';
  let urlForMatching = url;
  try {
    const parsedUrl = new URL(url);
    domain = parsedUrl.hostname;
    // blob:https://github.com/xxx has an empty hostname but a usable origin
    if (!domain && parsedUrl.protocol === 'blob:' && parsedUrl.origin && parsedUrl.origin !== 'null') {
      urlForMatching = parsedUrl.origin;
      domain = new URL(parsedUrl.origin).hostname;
    }
  } catch (e) {
    // data: URLs and malformed URLs fall through to the referrer
  }
  if (!domain && referrer) {
    try {
      urlForMatching = referrer;
      domain = new URL(referrer).hostname;
    } catch (e) {
      // Ignore invalid referrer
    }
  }
  if (!domain) domain = 'unknown';

  // Domain rules match the download URL, the blob origin, or the page it came from
  // (CDN downloads such as github.com → objects.githubusercontent.com need the referrer)
  const domainMatches = rules.filter(rule => {
    if (!rule || rule.type !== 'domain' || rule.enabled === false || !rule.value) return false;
    return matchesDomainRule(urlForMatching, rule.value) ||
      matchesDomainRule(url, rule.value) ||
      (referrer ? matchesDomainRule(referrer, rule.value) : false);
  }).map(r => ({ ...r, source: 'domain' }));

  // Filename contains rules (comma-separated phrases, empty phrases ignored)
  const containsMatches = rules.filter(rule => {
    if (!rule || rule.type !== 'contains' || rule.enabled === false) return false;
    return splitList(rule.value).some(phrase => filenameLower.includes(phrase));
  }).map(r => ({ ...r, source: 'contains' }));

  // Single extension rules
  const extensionMatches = rules.filter(rule => {
    if (!rule || rule.type !== 'extension' || rule.enabled === false || !extension) return false;
    return splitList(rule.value, { stripDots: true }).includes(extension);
  }).map(r => ({ ...r, source: 'extension' }));

  // File type groups
  const fileTypeMatches = [];
  if (extension) {
    for (const [name, group] of Object.entries(groups)) {
      if (!group || group.enabled === false) continue;
      if (!splitList(group.extensions, { stripDots: true }).includes(extension)) continue;

      const fileTypeRule = {
        type: 'filetype',
        value: group.extensions,
        folder: group.folder,
        priority: parsePriority(group.priority, 3.0),
        enabled: true,
        overrideDomainRules: group.overrideDomainRules || false,
        source: 'filetype',
        groupName: name
      };

      // "Override domain rules" puts the group just ahead of the best domain match
      if (fileTypeRule.overrideDomainRules && domainMatches.length > 0) {
        const lowestDomainPriority = Math.min(...domainMatches.map(r => parsePriority(r.priority, 2.0)));
        fileTypeRule.priority = Math.min(fileTypeRule.priority, lowestDomainPriority - 0.05);
      }

      fileTypeMatches.push(fileTypeRule);
    }
  }

  const allMatches = [...domainMatches, ...containsMatches, ...extensionMatches, ...fileTypeMatches]
    .filter(r => r.folder !== undefined && r.folder !== null);
  allMatches.sort(compareMatchedRules);

  let finalRule;
  let conflictRules = null;
  if (allMatches.length === 0) {
    finalRule = { folder: defaultFolder, source: 'default', priority: 999 };
  } else {
    const topPriority = parsePriority(allMatches[0].priority, 2.0);
    const samePriorityRules = allMatches.filter(r => Math.abs(parsePriority(r.priority, 2.0) - topPriority) < 0.01);
    if (conflictResolution === 'ask' && samePriorityRules.length > 1) {
      // Overlay will ask the user which rule to use
      finalRule = null;
      conflictRules = samePriorityRules;
    } else {
      finalRule = allMatches[0];
    }
  }

  return { domain, urlForMatching, extension, filename, allMatches, finalRule, conflictRules };
}

/**
 * Applies a routing decision to a download info object: relative path for Chrome,
 * or Downloads root plus a post-download move for absolute (companion app) paths.
 */
function applyRouteToDownloadInfo(downloadInfo, rule, rawFilename) {
  const folder = rule ? rule.folder : '';
  if (rule && isAbsolutePath(folder)) {
    downloadInfo.resolvedPath = extractFilename(rawFilename);
    downloadInfo.absoluteDestination = folder;
    downloadInfo.useAbsolutePath = true;
    downloadInfo.needsMove = true;
  } else {
    downloadInfo.resolvedPath = buildRelativePath(folder, rawFilename);
    downloadInfo.absoluteDestination = null;
    downloadInfo.useAbsolutePath = false;
    downloadInfo.needsMove = false;
  }
  return downloadInfo;
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
  
  // "Downloads" means the Downloads root; "Downloads/Videos" means Downloads/Videos, not a nested Downloads folder
  const withoutRoot = cleanFolder.replace(/^downloads(\/|$)/i, '');
  if (!withoutRoot) {
    return cleanFilename;
  }
  
  // Sanitize each folder segment in nested paths
  const folderSegments = withoutRoot.split('/')
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
/**
 * Chrome Downloads API: onDeterminingFilename
 * 
 * HOW DOWNLOAD DELAYING WORKS:
 * Chrome waits for the suggest() callback to be called before proceeding with the download.
 * By storing the suggest() callback and NOT calling it immediately, we effectively delay/pause
 * the download until the user confirms or the timeout expires.
 * 
 * Flow:
 * 1. onDeterminingFilename fires when download starts
 * 2. We store suggest() in downloadInfo.originalSuggest but don't call it yet
 * 3. Chrome waits - download is effectively paused until suggest() is called
 * 4. Overlay is shown to user for confirmation
 * 5. suggest() is called in proceedWithDownload() after:
 *    - User clicks "Save" in overlay, OR
 *    - Auto-save timeout expires, OR
 *    - Confirmation is disabled (immediate)
 * 6. Download then proceeds with the specified path
 * 
 * CHROME API LIMITATIONS (as of January 2026):
 * Chrome's onDeterminingFilename API provides a "hold" window that defers finalizing the
 * filename/path for a short time while extensions respond. Our overlay logic essentially
 * lives inside that window. However, there are critical limitations:
 * 
 * - Internal timeout: If listeners do not call suggest() in time, Chrome proceeds with the
 *   original filename. This timeout is internal to Chrome and extensions cannot change it.
 * - Unknown timeout duration: We don't know what the timeout value is - it's not documented
 *   and may vary by Chrome version or platform.
 * - Reliability concerns: Because we can't control or know the timeout, we cannot reliably
 *   delay downloads indefinitely. We must call suggest() within a reasonable time window.
 * - Default behavior: If suggest() is never called (e.g., extension crashes), Chrome will
 *   eventually timeout and proceed with the default filename/location.
 * 
 * This is why we use a configurable auto-save timeout (default 5 seconds) - it ensures we
 * call suggest() before Chrome's internal timeout, while still giving users time to interact
 * with the overlay.
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Our own re-download that moves a file to the place the user picked late (see relocateDownload)
  const relocation = downloadItem.byExtensionId === chrome.runtime.id && relocationsByUrl.get(downloadItem.url);
  if (relocation) {
    relocationsByUrl.delete(downloadItem.url);
    suggest({ filename: relocation.path, conflictAction: 'uniquify' });
    return;
  }
  // Retrieve user configuration from Chrome sync storage
  chrome.storage.sync.get(['rules', 'groups', 'confirmationEnabled', 'confirmationTimeout', 'defaultFolder', 'conflictResolution', 'extensionEnabled'], (data) => {
    handleDeterminingFilename(downloadItem, suggest, data || {}).catch((error) => {
      // Never leave a download waiting on us: fall back to Chrome's default location
      console.error('[BACKGROUND] Routing failed, using default location:', error);
      const info = pendingDownloads.get(downloadItem.id);
      pendingDownloads.delete(downloadItem.id);
      if (!info || info.originalSuggest) {
        try { suggest(); } catch (e) { /* suggest already called */ }
      }
    });
  });
  return true; // Required for async suggest operations
});

// Chrome stops waiting for onDeterminingFilename after ~15s and then saves to the default
// location, ignoring our rules. So the overlay never holds a download longer than this; at the
// cap we save wherever the user has chosen so far (even mid-edit or while hovering).
const MAX_CONFIRMATION_WAIT_MS = 12000;
const MAX_CONFIRMATION_TIMEOUT_MS = 10000;

async function handleDeterminingFilename(downloadItem, suggest, data) {
  // Extension paused: let Chrome handle the download normally
  if (data.extensionEnabled === false) {
    suggest();
    return;
  }

  const confirmationEnabled = data.confirmationEnabled !== false; // Default to true
  const confirmationTimeout = parseInt(data.confirmationTimeout, 10) > 0
    ? Math.min(parseInt(data.confirmationTimeout, 10), MAX_CONFIRMATION_TIMEOUT_MS)
    : 5000;

  const route = computeRoute(
    { url: downloadItem.url, referrer: downloadItem.referrer, filename: downloadItem.filename },
    data
  );
  debugLog('[BACKGROUND] Route for', route.filename, 'from', route.domain, '→', route.finalRule || route.conflictRules);

  // Store download information for potential confirmation or later processing
  const downloadInfo = {
    id: downloadItem.id,
    filename: route.filename,
    extension: route.extension,
    domain: route.domain,
    url: downloadItem.url,
    referrer: downloadItem.referrer || '',
    incognito: !!downloadItem.incognito,
    originalSuggest: suggest, // Store the suggest callback for later use
    finalRule: route.finalRule,
    conflictRules: route.conflictRules // For conflict resolution in overlay
  };
  // Folders outside Downloads need the companion app. Without it (e.g. a rule synced from
  // another computer), save to the closest matching folder inside Downloads instead.
  const needsCompanion = [route.finalRule, ...(route.conflictRules || [])]
    .some(rule => rule && isAbsolutePath(rule.folder));
  if (needsCompanion && !(await isCompanionAvailable())) {
    downloadInfo.finalRule = withRelativeFallback(route.finalRule);
    downloadInfo.conflictRules = route.conflictRules ? route.conflictRules.map(withRelativeFallback) : null;
  }

  // With a conflict, the first tied rule is the default until the user picks one
  applyRouteToDownloadInfo(downloadInfo, downloadInfo.finalRule || downloadInfo.conflictRules[0], downloadItem.filename);

  downloadInfo.confirmationTimeout = confirmationTimeout;

  // Track this download in the pending downloads map
  pendingDownloads.set(downloadItem.id, downloadInfo);

  if (!confirmationEnabled) {
    proceedWithDownload(downloadItem.id);
    return;
  }

  // Show confirmation overlay in the active tab. If the tab has no content script
  // (chrome:// pages, New Tab, Web Store, tabs opened before install/update), route right away.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) {
      proceedWithDownload(downloadItem.id);
      return;
    }
    downloadInfo.tabId = tab.id;
    chrome.tabs.sendMessage(tab.id, {
      type: 'showDownloadOverlay',
      downloadInfo: serializeDownloadInfo(downloadInfo),
      confirmationTimeout: confirmationTimeout,
      confirmationEnabled: confirmationEnabled
    }, () => {
      // "Receiving end does not exist" means no content script in that tab.
      // Other errors (e.g. no reply sent) still mean the overlay is showing.
      const error = chrome.runtime.lastError;
      if (error && /Receiving end does not exist|Could not establish connection/i.test(error.message || '')) {
        debugLog('[BACKGROUND] Overlay unavailable, routing immediately:', error.message);
        proceedWithDownload(downloadItem.id);
      }
    });
  });

  armDownloadTimeout(downloadItem.id, confirmationTimeout);

  // Absolute cap: proceed even if the overlay is paused or the tab went away
  downloadInfo.hardTimeoutId = setTimeout(() => {
    if (pendingDownloads.has(downloadItem.id)) {
      debugLog('[BACKGROUND TIMER] Hard cap reached, proceeding with download', downloadItem.id);
      proceedWithDownload(downloadItem.id);
    }
  }, MAX_CONFIRMATION_WAIT_MS);
}

// Downloads Chrome has already committed, kept briefly so a late choice from the overlay can
// still move the file. id → { id, filename, url, referrer, suggestedPath, savedAt }
const recentlySaved = new Map();
const RECENTLY_SAVED_TTL_MS = 10 * 60 * 1000;
// Re-downloads started by relocateDownload, keyed by URL → { path }
const relocationsByUrl = new Map();

function rememberSavedDownload(downloadInfo) {
  const now = Date.now();
  for (const [id, info] of recentlySaved) {
    if (now - info.savedAt > RECENTLY_SAVED_TTL_MS) recentlySaved.delete(id);
  }
  // Mirror to session storage (survives service worker restarts, cleared when Chrome quits)
  queueMicrotask(persistRecentlySaved);
  recentlySaved.set(downloadInfo.id, {
    id: downloadInfo.id,
    filename: downloadInfo.filename,
    url: downloadInfo.url,
    referrer: downloadInfo.referrer,
    suggestedPath: downloadInfo.suggestedPath,
    savedAt: now
  });
}

function persistRecentlySaved() {
  if (!chrome.storage.session) return;
  chrome.storage.session.set({ recentlySaved: Object.fromEntries(recentlySaved) }).catch(() => {});
}

/**
 * Finds a download Chrome already saved: in memory, or in session storage after a restart.
 */
async function lookupSavedDownload(downloadId) {
  if (recentlySaved.has(downloadId)) return recentlySaved.get(downloadId);
  if (!chrome.storage.session) return null;
  const { recentlySaved: stored } = await chrome.storage.session.get(['recentlySaved']);
  const saved = stored && stored[downloadId];
  if (!saved || Date.now() - saved.savedAt > RECENTLY_SAVED_TTL_MS) return null;
  recentlySaved.set(downloadId, saved);
  return saved;
}

/**
 * Resolves when a download is no longer in progress (complete or interrupted), or null on timeout.
 */
function waitForDownloadEnd(downloadId, timeoutMs = 10 * 60 * 1000) {
  return new Promise(resolve => {
    let timer;
    const finish = (item) => {
      chrome.downloads.onChanged.removeListener(onChanged);
      clearTimeout(timer);
      resolve(item);
    };
    const check = () => chrome.downloads.search({ id: downloadId }, ([item]) => {
      if (!item) finish(null);
      else if (item.state !== 'in_progress') finish(item);
    });
    const onChanged = (delta) => { if (delta.id === downloadId && delta.state) check(); };
    chrome.downloads.onChanged.addListener(onChanged);
    timer = setTimeout(() => finish(null), timeoutMs);
    check();
  });
}

/**
 * Compares the place the user picked in the overlay with where Chrome saved the file and,
 * if different, moves it there.
 *
 * Inputs:
 *   - saved: recentlySaved / pendingDownloads entry with suggestedPath
 *   - requested: downloadInfo from the overlay (resolvedPath, filename, absoluteDestination, needsMove)
 */
async function relocateIfChanged(saved, requested) {
  const filename = extractFilename(requested.filename || saved.filename);
  let target;
  if (requested.needsMove && requested.absoluteDestination) {
    target = { absoluteFolder: requested.absoluteDestination, filename };
  } else {
    const requestedPath = normalizePath(requested.resolvedPath || filename);
    const folder = requestedPath.includes('/') ? requestedPath.replace(/\/[^/]*$/, '') : '';
    target = { relativePath: buildRelativePath(folder || 'Downloads', filename) };
  }
  if (target.relativePath && target.relativePath === saved.suggestedPath) {
    return { success: true, alreadyProceeded: true };
  }
  return relocateDownload(saved, target);
}

/**
 * Moves an already-saved download to a new place.
 * With the companion app the file is moved on disk. Without it, Chrome can't move files, so the
 * file is downloaded again into the new place and the first copy is removed only after the new
 * one finished. Downloads that can't be fetched again (blob:, data:, failed requests) stay put.
 */
async function relocateDownload(saved, target) {
  const [item] = await chrome.downloads.search({ id: saved.id });
  if (!item) return { success: false, error: 'Download not found' };

  const companion = await isCompanionAvailable();
  // The card that asked for the move shows the result ("Moved to X" / "Couldn't move it"),
  // so no system notifications here.
  const notify = () => {};
  const savedFolder = saved.suggestedPath.includes('/') ? saved.suggestedPath.replace(/\/[^/]*$/, '') : 'Downloads';

  if (companion) {
    const done = item.state === 'complete' ? item : await waitForDownloadEnd(saved.id);
    if (!done || done.state !== 'complete') return { success: false, error: 'Download did not finish' };
    let destination;
    if (target.absoluteFolder) {
      destination = target.absoluteFolder.replace(/[\\/]+$/, '') + '/' + target.filename;
    } else {
      // Downloads root = Chrome's full path minus as many segments as the relative path we
      // suggested (works even when Chrome renamed the file to "name (1).ext")
      const sourceSegments = done.filename.replace(/\\/g, '/').split('/');
      const depth = saved.suggestedPath.split('/').length;
      const root = sourceSegments.slice(0, sourceSegments.length - depth).join('/');
      destination = root + '/' + target.relativePath;
    }
    const result = await moveFileNative(done.filename, destination, { destIsFile: true });
    if (result && result.moved) {
      notify('Moved', `${target.filename || extractFilename(target.relativePath)} moved to ${extractFilename(destination.replace(/\/[^/]*$/, '')) || 'Downloads'}`);
      return { success: true, relocated: true, destination: result.destination || destination };
    }
    return { success: false, error: 'Move failed' };
  }

  // No companion: an absolute folder maps into Downloads, then re-download there
  const relativePath = target.relativePath ||
    buildRelativePath(relativeFallbackFolder(target.absoluteFolder), target.filename);
  const url = item.url;
  if (!/^https?:/i.test(url)) {
    notify('Couldn\'t move download', `${item.filename.split(/[\\/]/).pop()} can only be saved once. It's in ${savedFolder}.`);
    return { success: false, reason: 'cannot-refetch', savedPath: saved.suggestedPath };
  }

  relocationsByUrl.set(url, { path: relativePath });
  let newId;
  try {
    newId = await chrome.downloads.download({ url, filename: relativePath, conflictAction: 'uniquify', saveAs: false });
  } catch (error) {
    relocationsByUrl.delete(url);
    notify('Couldn\'t move download', `It's still in ${savedFolder}.`);
    return { success: false, error: error.message };
  }

  const newItem = await waitForDownloadEnd(newId);
  if (!newItem || newItem.state !== 'complete') {
    notify('Couldn\'t move download', `The site didn't allow downloading it again. It's still in ${savedFolder}.`);
    return { success: false, reason: 'refetch-failed', savedPath: saved.suggestedPath };
  }

  // New copy is safe on disk: remove the first copy (wait for it to finish if it's still going)
  const oldItem = item.state === 'in_progress' ? await waitForDownloadEnd(saved.id) : item;
  if (oldItem && oldItem.state === 'complete' && oldItem.exists !== false) {
    try { await chrome.downloads.removeFile(saved.id); } catch (e) { /* already gone */ }
  }
  try { await chrome.downloads.erase({ id: saved.id }); } catch (e) { /* ignore */ }

  // Keep the popup's Recent list pointing at the new location
  const { downloadStats } = await chrome.storage.local.get(['downloadStats']);
  if (downloadStats && Array.isArray(downloadStats.recentActivity)) {
    const newFolder = relativePath.includes('/') ? relativePath.replace(/\/[^/]*$/, '') : 'Downloads';
    downloadStats.recentActivity = downloadStats.recentActivity.map(entry => entry.downloadId === saved.id
      ? { ...entry, downloadId: newId, filename: extractFilename(newItem.filename), filePath: newItem.filename, folder: newFolder }
      : entry);
    await chrome.storage.local.set({ downloadStats });
  }
  recentlySaved.delete(saved.id);
  persistRecentlySaved();
  rememberSavedDownload({ id: newId, filename: extractFilename(newItem.filename), url, referrer: saved.referrer, suggestedPath: relativePath });

  const newFolderName = relativePath.includes('/') ? relativePath.split('/').slice(-2, -1)[0] : 'Downloads';
  notify('Moved', `${extractFilename(newItem.filename)} moved to ${newFolderName}`);
  return { success: true, relocated: true, newDownloadId: newId, savedPath: relativePath };
}

/**
 * Resolves whether the companion app can be used right now (waits briefly for the first check).
 */
async function isCompanionAvailable() {
  if (companionAppStatus.lastChecked > 0 && !companionStatusCheckPromise) {
    return !!companionAppStatus.installed;
  }
  const status = await Promise.race([
    checkCompanionAppStatus(),
    new Promise(resolve => setTimeout(() => resolve({ installed: false }), 1500))
  ]);
  return !!(status && status.installed);
}

/**
 * Maps an absolute folder to a folder inside Downloads for use without the companion app.
 *
 * Examples:
 *   - "/Users/me/Downloads/Code/Work" → "Code/Work"
 *   - "/Users/me/Documents/Invoices" → "Invoices"
 *   - "C:\\Users\\me\\Downloads" → "Downloads" (root)
 */
function relativeFallbackFolder(absolutePath) {
  const segments = String(absolutePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const downloadsIndex = segments.map(seg => seg.toLowerCase()).lastIndexOf('downloads');
  if (downloadsIndex !== -1) {
    const inside = segments.slice(downloadsIndex + 1).join('/');
    return inside || 'Downloads';
  }
  const last = segments[segments.length - 1] || '';
  return /^[A-Za-z]:$/.test(last) || !last ? 'Downloads' : last;
}

/**
 * Returns a copy of a matched rule whose absolute folder is replaced by its Downloads fallback.
 */
function withRelativeFallback(rule) {
  if (!rule || !isAbsolutePath(rule.folder)) return rule;
  return { ...rule, folder: relativeFallbackFolder(rule.folder), originalFolder: rule.folder, companionFallback: true };
}

/**
 * Clears the auto-save and hard-cap timers for a pending download.
 */
function clearDownloadTimers(downloadInfo) {
  if (downloadInfo.timeoutId) clearTimeout(downloadInfo.timeoutId);
  if (downloadInfo.hardTimeoutId) clearTimeout(downloadInfo.hardTimeoutId);
  downloadInfo.timeoutId = null;
  downloadInfo.hardTimeoutId = null;
}

/**
 * Returns a copy of downloadInfo that is safe to send in a message (no functions or timer ids).
 */
function serializeDownloadInfo(downloadInfo) {
  const { originalSuggest, timeoutId, hardTimeoutId, ...rest } = downloadInfo;
  return rest;
}

/**
 * Starts (or restarts) the auto-save timer for a pending download.
 * When it fires, the overlay is asked whether an editor is open. A missing answer
 * (tab closed, navigated, or no content script) counts as "no editor" so the download proceeds.
 * If an editor is open, the timer re-arms instead of giving up.
 */
function armDownloadTimeout(downloadId, delayMs) {
  const downloadInfo = pendingDownloads.get(downloadId);
  if (!downloadInfo || downloadInfo.confirmed) return;
  if (downloadInfo.timeoutId) clearTimeout(downloadInfo.timeoutId);
  downloadInfo.timeoutPaused = false;

  downloadInfo.timeoutId = setTimeout(() => {
    const pendingInfo = pendingDownloads.get(downloadId);
    if (!pendingInfo || pendingInfo.timeoutPaused) return;

    const tabId = pendingInfo.tabId;
    if (tabId === undefined) {
      proceedWithDownload(downloadId);
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'checkEditorState', downloadId }, (response) => {
      if (chrome.runtime.lastError || !response) {
        proceedWithDownload(downloadId);
        return;
      }
      const current = pendingDownloads.get(downloadId);
      if (!current || current.timeoutPaused) return;
      if (response.hasEditor) {
        // User is still editing: check again shortly (the hard cap still applies)
        armDownloadTimeout(downloadId, 2000);
      } else {
        proceedWithDownload(downloadId);
      }
    });
  }, delayMs);
}

/**
 * Listen for rule/group changes and reload rules for pending downloads
 * Fixes timing bug where rules added during download don't apply
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  // Only respond to sync storage changes (where rules are stored)
  if (areaName !== 'sync') return;
  if (!(changes.rules || changes.groups || changes.defaultFolder)) return;

  // Any rule, file type or default-folder change can change where an open card's download
  // goes. Ask each open card to re-evaluate (it keeps a folder the user picked on the card).
  pendingDownloads.forEach((downloadInfo, downloadId) => {
    if (downloadInfo.confirmed || downloadInfo.tabId === undefined) return;
    chrome.tabs.sendMessage(downloadInfo.tabId, { type: 'rulesUpdated', downloadId }, () => {
      void chrome.runtime.lastError; // Tab closed or card already gone
    });
  });
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
    const savedInfo = (downloadInfo && downloadInfo.confirmed) ? downloadInfo : recentlySaved.get(message.downloadInfo.id);
    if (savedInfo && savedInfo.suggestedPath) {
      // Chrome already committed this download (auto-save timer or 12s cap won the race,
      // e.g. the user took 20s in Save As). Never replace the pending entry with the overlay's
      // copy; instead move the file if the user picked a different place.
      relocateIfChanged(savedInfo, message.downloadInfo)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (downloadInfo && downloadInfo.originalSuggest) {
      // Update existing downloadInfo with new values from content script
      Object.assign(downloadInfo, serializeDownloadInfo(message.downloadInfo));
      // Cancel the auto-save timeout since user is taking action
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      }
      // proceedWithDownload: Processes and saves the download with specified path
      // Only call if originalSuggest is available (download hasn't started yet)
      proceedWithDownload(message.downloadInfo.id, message.downloadInfo.resolvedPath);
      // Send immediate response to prevent port closure
      sendResponse({ success: true, message: 'Download proceeding' });
      return true; // Indicate we will send response asynchronously (already sent)
    } else {
      // Not pending here: the service worker may have restarted after Chrome saved the file.
      // Find what we saved (kept in session storage) and move it if the user chose elsewhere.
      lookupSavedDownload(message.downloadInfo.id).then(async (saved) => {
        if (saved && saved.suggestedPath) {
          sendResponse(await relocateIfChanged(saved, message.downloadInfo));
          return;
        }
        // Unknown download: be honest instead of claiming success
        const [item] = await chrome.downloads.search({ id: message.downloadInfo.id });
        const parts = item && item.filename ? item.filename.split(/[\\/]/) : [];
        sendResponse({ success: false, reason: 'unknown-download', savedPath: parts.slice(-2).join('/') });
      }).catch(error => sendResponse({ success: false, error: error.message }));
      return true;
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
      debugLog('Download timeout paused for:', message.downloadId);
    }
    sendResponse({ success: true });
  } else if (message.type === 'resumeDownloadTimeout') {
    // resumeDownloadTimeout: Resume auto-save timeout when user closes editor
    const downloadInfo = pendingDownloads.get(message.downloadId);
    if (downloadInfo) {
      downloadInfo.timeoutPaused = false;
      // Restart the auto-save timer with the remaining (or configured) time
      const timeoutMs = message.remainingTime > 0 ? message.remainingTime : (downloadInfo.confirmationTimeout || 5000);
      armDownloadTimeout(message.downloadId, timeoutMs);
      debugLog('Download timeout resumed for:', message.downloadId, 'with', timeoutMs, 'ms');
    }
    sendResponse({ success: true });
  } else if (message.type === 'cancelDownloadTimeout') {
    // cancelDownloadTimeout: Cancel auto-save timeout entirely - no auto-save while editing
    const cancelTimestamp = new Date().toISOString();
    const downloadInfo = pendingDownloads.get(message.downloadId);
    debugLog('[BACKGROUND]', cancelTimestamp, 'cancelDownloadTimeout received for:', message.downloadId, 'downloadInfo exists:', !!downloadInfo);
    if (downloadInfo) {
      downloadInfo.timeoutPaused = true;
      if (downloadInfo.timeoutId) {
        clearTimeout(downloadInfo.timeoutId);
        debugLog('[BACKGROUND]', cancelTimestamp, 'Cleared timeout ID:', downloadInfo.timeoutId);
        downloadInfo.timeoutId = null;
      } else {
        debugLog('[BACKGROUND]', cancelTimestamp, 'No timeoutId to clear');
      }
      debugLog('[BACKGROUND]', cancelTimestamp, 'Download timeout cancelled for:', message.downloadId);
    } else {
      debugLog('[BACKGROUND]', cancelTimestamp, 'Warning: No downloadInfo found for cancelDownloadTimeout');
    }
    sendResponse({ success: true });
  } else if (message.type === 'cancelDownload') {
    // cancelDownload: User clicked cancel/close button - cancel the download entirely
    const downloadId = message.downloadId;
    const downloadInfo = pendingDownloads.get(downloadId);
    if (downloadInfo) {
      // Cancel any pending timers and remove from pending downloads
      clearDownloadTimers(downloadInfo);
      pendingDownloads.delete(downloadId);
    }
    // Cancel the download in Chrome
    chrome.downloads.cancel(downloadId, () => {
      if (chrome.runtime.lastError) {
        // Ignore "Download must be in progress" error - download may have already completed
        if (chrome.runtime.lastError.message && 
            !chrome.runtime.lastError.message.includes('must be in progress')) {
          debugLog('Download cancel error:', chrome.runtime.lastError.message);
        }
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
      Object.assign(downloadInfo, serializeDownloadInfo(message.downloadInfo));
      debugLog('[updatePendingDownloadInfo] Updated download', downloadId, 'with finalRule:', message.downloadInfo.finalRule);
    }
    sendResponse({ success: true });
  } else if (message.type === 'reEvaluateDownloadRules') {
    // reEvaluateDownloadRules: Re-evaluate rules for a pending download after rules are updated
    const downloadId = message.downloadId;
    const downloadInfo = pendingDownloads.get(downloadId);
    if (!downloadInfo) {
      sendResponse({ success: false, error: 'Download not found' });
      return true;
    }
    
    // Use the existing rule evaluation logic (same as download handler)
    chrome.storage.sync.get(['rules', 'groups', 'conflictResolution', 'defaultFolder'], (data) => {
      const rules = data.rules || [];
      const groups = data.groups || {};
      const conflictResolution = data.conflictResolution || 'auto';
      const defaultFolder = data.defaultFolder || 'Downloads';
      
      // Same evaluation as the download handler (including referrer / blob origin matching)
      const route = computeRoute(
        { url: downloadInfo.url, referrer: downloadInfo.referrer, filename: downloadInfo.filename },
        { rules, groups, conflictResolution, defaultFolder }
      );
      downloadInfo.finalRule = route.finalRule;
      downloadInfo.conflictRules = route.conflictRules;
      applyRouteToDownloadInfo(downloadInfo, route.finalRule || route.conflictRules[0], downloadInfo.filename);
      debugLog('[RE-EVALUATE RULES] Final rule:', route.finalRule, 'path:', downloadInfo.resolvedPath);
      
      // The requesting overlay gets updatedDownloadInfo in the response. Don't broadcast a
      // reload here: the overlay answers a reload by asking to re-evaluate, which loops.
      
      debugLog('[RE-EVALUATE RULES] Returning updated downloadInfo:', {
        id: downloadInfo.id,
        resolvedPath: downloadInfo.resolvedPath,
        absoluteDestination: downloadInfo.absoluteDestination,
        useAbsolutePath: downloadInfo.useAbsolutePath,
        needsMove: downloadInfo.needsMove,
        finalRule: downloadInfo.finalRule
      });
      
      sendResponse({
        success: true,
        updatedDownloadInfo: serializeDownloadInfo(downloadInfo)
      });
    });
    return true; // Required for async sendResponse
  } else if (message.type === 'addRule') {
    // addRule: Adds or updates a routing rule in storage
    addRule(message.rule).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('addRule error:', error);
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
    pickFolderNative(message.startPath).then(async path => {
      // The popup closes when the native picker takes focus, so it can ask us to save the rule
      if (path && message.thenAddRule && message.thenAddRule.value) {
        await addRule({ ...message.thenAddRule, folder: path }).catch(error => console.error('thenAddRule failed:', error));
      }
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
  } else if (message.type === 'getFolderSuggestions') {
    // Folders for the card's folder menu: most recently used first, then folders from rules
    getFolderSuggestions().then(folders => sendResponse({ success: true, folders }))
      .catch(error => sendResponse({ success: false, folders: [], error: error.message }));
    return true;
  } else if (message.type === 'getSiteRoute') {
    // Popup "This site": where downloads from this page go, and why
    chrome.storage.sync.get(['rules', 'groups', 'defaultFolder'], (data) => {
      const rules = (data.rules || []).filter(r => r && r.type === 'domain' && r.enabled !== false && r.value &&
        matchesDomainRule(message.url, r.value));
      rules.sort(compareMatchedRules);
      const hasTypes = Object.values(data.groups || {}).some(g => g && g.enabled !== false);
      sendResponse(rules.length
        ? { kind: 'site', rule: rules[0], folder: rules[0].folder }
        : { kind: hasTypes ? 'type' : 'default', folder: data.defaultFolder || 'Downloads' });
    });
    return true;
  } else if (message.type === 'openFolder') {
    // openFolder: Open folder containing the file. Only our own pages (the popup) may ask:
    // web pages run content scripts and must never choose paths for the companion app.
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ success: false, error: 'Not allowed' });
      return;
    }
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
/**
 * Opens folder containing downloaded file
 * Works with or without companion app using fallback strategy
 */
async function openDownloadFolder(filePath, downloadId) {
  // Try companion app first for best UX (highlights file)
  try {
    const companionStatus = await self.nativeMessagingClient.checkCompanionApp();

    if (companionStatus && companionStatus.installed) {
      const result = await self.nativeMessagingClient.openFolder(filePath);
      if (result && result.success) {
        return; // Success - file opened with companion app
      }
    }
  } catch (error) {
    debugLog('Companion app not available or failed:', error.message);
  }

  // Fallback: Use Chrome's built-in downloads API
  if (downloadId) {
    try {
      await chrome.downloads.show(downloadId);
      return;
    } catch (error) {
      console.error('Failed to show download with Chrome API:', error);
    }
  }

  // Last resort: Open default downloads folder
  try {
    chrome.downloads.showDefaultFolder();
  } catch (error) {
    console.error('Failed to show downloads folder:', error);
  }
}

chrome.notifications.onClicked.addListener((notificationId) => {
  // Check if this is a completed download notification
  const completedData = completedDownloads.get(notificationId);

  if (completedData && completedData.filePath) {
    // Open folder containing the completed file
    openDownloadFolder(completedData.filePath, completedData.downloadId);

    // Clean up
    chrome.notifications.clear(notificationId);
    completedDownloads.delete(notificationId);
  } else {
    // Fallback to pending downloads (confirmation overlay)
    const downloadInfo = pendingDownloads.get(notificationId);
    if (downloadInfo) {
      // Proceed with download immediately on notification body click
      proceedWithDownload(downloadInfo.id);
      // Clean up notification and tracking
      chrome.notifications.clear(notificationId);
      pendingDownloads.delete(notificationId);
    }
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
    // IMPORTANT: Only move if download has been confirmed (countdown expired or user clicked save)
    // Don't auto-move while countdown is still running - wait for user confirmation
    if (downloadInfo && downloadInfo.needsMove && downloadInfo.absoluteDestination) {
      // Check if download has been confirmed (countdown expired or user clicked save)
      // Only move if confirmed is true
      if (!downloadInfo.confirmed) {
        // Not confirmed yet - store the download path for later move when confirmed
        const downloads = await chrome.downloads.search({ id: downloadId });
        if (downloads && downloads.length > 0) {
          downloadInfo.actualDownloadPath = downloads[0].filename;
          downloadInfo.downloadComplete = true;
          debugLog('[onChanged] Download complete but not confirmed yet, waiting for confirmation. confirmed:', downloadInfo.confirmed, 'timeoutPaused:', downloadInfo.timeoutPaused);
        }
        return;
      }
      
      debugLog('[onChanged] Download confirmed, proceeding with move');
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
            debugLog(`File moved: ${sourcePath} -> ${actualDestination}`);
            // Mark that file was moved so Save As knows correct source
            downloadInfo.fileMoved = true;
            downloadInfo.downloadComplete = true;
            // Store actual final destination (important for cross-device moves)
            downloadInfo.actualFinalDestination = actualDestination;
            
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
  // Incognito downloads never appear in the Recent list or the counts
  if (downloadInfo.incognito) return;

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
    // Per-day counts (last 8 days) so the popup can say "Sorted N files this week" exactly
    const today = new Date();
    const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    stats.dailyCounts = stats.dailyCounts || {};
    stats.dailyCounts[dayKey(today)] = (stats.dailyCounts[dayKey(today)] || 0) + 1;
    const oldest = dayKey(new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000));
    for (const key of Object.keys(stats.dailyCounts)) {
      if (key < oldest) delete stats.dailyCounts[key];
    }
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
    const actualPath = downloadInfo.actualFinalDestination || downloadInfo.resolvedPath || downloadInfo.filename;
    // Show the folder inside Downloads ("Documents", "Code/Work") when Chrome saved it where we
    // suggested; only companion-app moves to other folders show the tail of the absolute path.
    let folderPath;
    if (!downloadInfo.fileMoved && downloadInfo.suggestedPath) {
      folderPath = downloadInfo.suggestedPath.includes('/')
        ? downloadInfo.suggestedPath.split('/').slice(0, -1).join('/')
        : 'Downloads';
    } else {
      const parts = actualPath.split(/[\\/]/).filter(Boolean);
      folderPath = parts.length > 1 ? parts.slice(-3, -1).join('/') : 'Downloads';
    }
    // Real name on disk (Chrome may have renamed it to "name (1).ext")
    const savedName = extractFilename(actualPath) || downloadInfo.filename;
    
    stats.recentActivity.unshift({
      filename: savedName,
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
  
  // Mark as confirmed so onChanged handler knows to proceed with move
  downloadInfo.confirmed = true;
  clearDownloadTimers(downloadInfo);
  
  // Check if download already has absolute destination set (from rule matching or location change)
  // or if a custom path is being provided that's absolute
  // Without the companion app an absolute path can't be used: map it into Downloads
  // (only possible while Chrome is still waiting for our suggested path)
  const companionMissing = companionAppStatus.lastChecked > 0 && !companionAppStatus.installed;
  if (companionMissing && downloadInfo.originalSuggest) {
    if (customPath && isAbsolutePath(customPath)) {
      // The overlay may send "folder/filename"; keep only the folder part
      const folderOnly = extractFilename(customPath) === downloadInfo.filename
        ? customPath.replace(/[\\/][^\\/]*$/, '')
        : customPath;
      customPath = buildRelativePath(relativeFallbackFolder(folderOnly), downloadInfo.filename);
    } else if (downloadInfo.needsMove && downloadInfo.absoluteDestination &&
               (!customPath || !normalizePath(customPath).includes('/'))) {
      // Absolute rule: Chrome would save to the Downloads root and the move would fail
      applyRouteToDownloadInfo(downloadInfo, { folder: relativeFallbackFolder(downloadInfo.absoluteDestination) }, downloadInfo.filename);
      customPath = null;
    }
  }
  const hasAbsoluteDestination = downloadInfo.absoluteDestination && downloadInfo.needsMove;
  const customPathIsAbsolute = customPath && isAbsolutePath(customPath);
  
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
    // If we need to move the file, check if already downloaded and move
    const destPath = absoluteDestinationPath || downloadInfo.absoluteDestination;
    if (destPath && downloadInfo.needsMove) {
      // Use stored actualDownloadPath if available, otherwise search for it
      const sourcePath = downloadInfo.actualDownloadPath;
      if (sourcePath && downloadInfo.downloadComplete) {
        // Download already complete and we have the path - move now
        debugLog('[proceedWithDownload] Download already complete, moving file now');
        moveFileNative(sourcePath, destPath).then((result) => {
          if (result && result.moved) {
            const actualDestination = result.destination || destPath;
            // Store actual final destination for stats and popup display
            downloadInfo.actualFinalDestination = actualDestination;
            downloadInfo.fileMoved = true;
            
            // Update stats with correct final destination
            updateDownloadStats(downloadId);
          }
        });
      } else {
        // Need to look up download state
        chrome.downloads.search({ id: downloadId }, (downloads) => {
          if (downloads && downloads.length > 0 && downloads[0].state === 'complete') {
            // Download complete - move file now
            debugLog('[proceedWithDownload] Found complete download, moving file');
            moveFileNative(downloads[0].filename, destPath).then((result) => {
              if (result && result.moved) {
                const actualDestination = result.destination || destPath;
                // Store actual final destination for stats and popup display
                downloadInfo.actualFinalDestination = actualDestination;
                downloadInfo.fileMoved = true;
                
                // Update stats with correct final destination
                updateDownloadStats(downloadId);
              }
            });
          }
        });
      }
    }
    return;
  }
  // suggest() may only be called once per download: consume it so later calls
  // (overlay save racing the auto-save timer) can't call it again
  const suggestOnce = downloadInfo.originalSuggest;
  downloadInfo.originalSuggest = null;
  try {
    suggestOnce({ 
      filename: finalPath, 
      conflictAction: 'uniquify' // Automatically rename if file already exists
    });
  } catch (error) {
    console.error('Error calling originalSuggest:', error);
  }

  downloadInfo.suggestedPath = normalizePath(finalPath);
  rememberSavedDownload(downloadInfo);

  // If background saved it (timer or cap), update the overlay that is still showing. While the
  // user is still choosing (editor open / hovering), keep the card open: their choice will move
  // the file afterwards. Otherwise close it.
  if (downloadInfo.tabId !== undefined) {
    const stillChoosing = downloadInfo.timeoutPaused === true;
    chrome.tabs.sendMessage(downloadInfo.tabId, {
      type: stillChoosing ? 'downloadSavedEarly' : 'closeOverlay',
      downloadId,
      savedPath: downloadInfo.suggestedPath
    }, () => {
      void chrome.runtime.lastError; // Tab may be gone or overlay already closed
    });
  }
  
  // No "Download Routed" notification: the card (or Chrome's own download bubble) already
  // shows where the file went. Notifications are kept for failures only.

  // Note: Don't delete from pendingDownloads yet - we need it for post-download move
  // It will be cleaned up after file move completes
}

/**
 * Adds or updates a routing rule in sync storage.
 * Updates existing rule if one with same type and value exists.
 * 
 * Inputs:
 *   - rule: Object containing rule properties:
 *     - type: String ('domain' or 'contains')
 *     - value: String (domain name or comma-separated phrases for contains rules)
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
        // Update existing rule at found index, keeping priority/enabled the user already set
        const existing = rules[existingRuleIndex];
        rules[existingRuleIndex] = {
          ...existing,
          ...rule,
          priority: rule.priority !== undefined ? rule.priority : (existing.priority ?? 2.0),
          enabled: true
        };
      } else {
        // Add new rule to end of array
        rules.push({ priority: 2.0, enabled: true, ...rule });
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

  // Share one in-flight check instead of reporting "not installed" while it runs
  if (companionStatusCheckPromise) {
    return companionStatusCheckPromise;
  }
  companionStatusCheckPromise = runCompanionAppStatusCheck(now).finally(() => {
    companionStatusCheckPromise = null;
  });
  return companionStatusCheckPromise;
}

let companionStatusCheckPromise = null;

/**
 * After a failed companion call, re-check the companion next time instead of trusting the
 * 5-minute cache, so a broken or removed companion falls back to folders inside Downloads.
 */
function markCompanionSuspect() {
  companionAppStatus.lastChecked = 0;
}

async function runCompanionAppStatusCheck(now) {

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
async function moveFileNative(sourcePath, destinationPath, { destIsFile = false } = {}) {
  if (!self.nativeMessagingClient || !self.nativeMessagingClient.moveFile) {
    console.error('Native messaging client not available for file move');
    return { success: false, moved: false };
  }

  // Always send the companion a full file path. Callers say whether they passed a folder
  // (the file keeps its name inside it) or the exact file path (e.g. after a rename).
  // Guessing from extensions nested extensionless or renamed files ("README/README").
  if (!destIsFile) {
    const sourceName = String(sourcePath || '').split(/[\\/]/).pop();
    const separator = destinationPath.includes('\\') && !destinationPath.includes('/') ? '\\' : '/';
    destinationPath = destinationPath.replace(/[\\/]+$/, '') + separator + sourceName;
  }

  try {
    const result = await self.nativeMessagingClient.moveFile(sourcePath, destinationPath, { destIsFile: true });
    if (!result || !result.moved) markCompanionSuspect();
    return result;
  } catch (error) {
    console.error('Failed to move file:', error);
    markCompanionSuspect();
    return { success: false, moved: false };
  }
}

// Check companion app status on extension startup
chrome.runtime.onStartup.addListener(() => {
  checkCompanionAppStatus();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  checkCompanionAppStatus();
  
  if (details.reason === 'install') {
    chrome.storage.local.set({ showWelcome: true });
    try {
      // Save the default file types so what the settings page shows is what actually routes
      const { groups } = await chrome.storage.sync.get(['groups']);
      if (!groups) {
        const defaults = {};
        for (const [name, group] of Object.entries(getDefaultGroups())) {
          defaults[name] = { ...group, priority: 3.0, overrideDomainRules: false, enabled: true };
        }
        await chrome.storage.sync.set({ groups: defaults });
      }
    } catch (error) {
      console.error('Default file type setup error:', error);
    }
    // Welcome page explains how routing works and lets the user try it
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#welcome') });
  }

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
      
      // Only save if migration was needed (never create groups for existing users here)
      if (needsMigration) {
        const update = { rules: migratedRules };
        if (groups) update.groups = migratedGroups;
        await chrome.storage.sync.set(update);
        debugLog('Migrated rules and groups to priority system');
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

    // Rule model v2: the order is simply websites → names → types (Settings shows it that way),
    // so drop per-rule priority numbers, "override site rules" and the "ask" tie mode once.
    try {
      const { rulesModelVersion } = await chrome.storage.local.get(['rulesModelVersion']);
      if ((rulesModelVersion || 0) < 2) {
        const data = await chrome.storage.sync.get(['rules', 'groups', 'conflictResolution']);
        const update = { conflictResolution: 'auto' };
        // Keep the old rules so custom priorities can be restored, and remember whether this
        // user's routing can actually change so Settings can explain it once
        const routingChanges = (data.rules || []).some(r => parsePriority(r.priority, 2.0) !== 2.0) ||
          Object.values(data.groups || {}).some(g => parsePriority(g.priority, 3.0) !== 3.0 || g.overrideDomainRules) ||
          data.conflictResolution === 'ask';
        await chrome.storage.local.set({
          rulesBackupV1: { ...data, savedAt: Date.now() },
          ...(routingChanges ? { rulesModelNotice: true } : {})
        });
        if (Array.isArray(data.rules)) {
          update.rules = data.rules.map(rule => ({ ...rule, priority: 2.0 }));
        }
        if (data.groups) {
          update.groups = {};
          for (const [name, group] of Object.entries(data.groups)) {
            update.groups[name] = { ...group, priority: 3.0, overrideDomainRules: false };
          }
        }
        await chrome.storage.sync.set(update);
        await chrome.storage.local.set({ rulesModelVersion: 2 });
      }
    } catch (error) {
      console.error('Rule model migration error:', error);
    }

    // Tabs that were open before install/update have no (or an orphaned) content script,
    // so the overlay couldn't appear there. Inject it now.
    injectContentScriptIntoOpenTabs();
  }
});

/**
 * Injects the overlay content script into already-open http(s) tabs.
 * Manifest content scripts only load on pages opened after install/update.
 */
async function injectContentScriptIntoOpenTabs() {
  if (!chrome.scripting) return;
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (tab.discarded) continue;
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/validation.js', 'content.js'] })
        .catch(() => { /* Restricted pages (e.g. Web Store) can't be scripted */ });
    }
  } catch (error) {
    console.error('Content script injection error:', error);
  }
}

// Initial check
checkCompanionAppStatus();
