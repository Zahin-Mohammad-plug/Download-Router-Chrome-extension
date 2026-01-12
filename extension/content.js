/**
 * content.js
 * 
 * Purpose: Content script for the Download Router Chrome extension.
 * Role: Manages the Shadow DOM overlay system that displays download confirmation dialogs
 *       directly on web pages. Handles user interactions, countdown timers, and rule editing
 *       within the overlay interface.
 * 
 * Key Responsibilities:
 * - Create and manage Shadow DOM overlay for download confirmations
 * - Handle user interactions (save, edit rules, change location)
 * - Manage countdown timer for auto-save functionality
 * - Provide inline rule editing capabilities
 * - Fallback to notification system when overlay injection fails
 * 
 * Architecture:
 * - Uses Shadow DOM for style isolation to prevent conflicts with website CSS
 * - Communicates with background.js via Chrome runtime messaging
 * - Self-contained overlay system with embedded CSS and HTML
 */

/**
 * Path Utility Functions
 * 
 * These functions handle path normalization for paths entered by users in the overlay.
 * They mirror the functions in background.js to ensure consistent path formatting.
 */

/**
 * Helper function to format path display in breadcrumb format.
 * Converts relative paths like "3DPrinting/file.stl" to "Downloads > 3DPrinting"
 * Handles absolute paths by showing the folder name.
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
 * Extracts just the filename from a potentially path-containing string.
 */
function extractFilename(path) {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop();
}

/**
 * Normalizes a folder path by converting backslashes to forward slashes
 * and removing leading/trailing slashes.
 */
function normalizePath(path) {
  if (!path || path.trim() === '') return '';
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

/**
 * Sanitizes folder name by removing invalid characters.
 */
function sanitizeFolderName(folder) {
  if (!folder) return '';
  return folder
    .replace(/[<>:"|?*\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/^\.+$/, '')
    .trim();
}

/**
 * Builds a valid relative path for Chrome downloads API.
 */
function buildRelativePath(folder, filename) {
  const cleanFolder = normalizePath(folder);
  const cleanFilename = extractFilename(filename);
  
  if (!cleanFolder || cleanFolder === 'Downloads') {
    return cleanFilename;
  }
  
  const folderSegments = cleanFolder.split('/')
    .map(segment => sanitizeFolderName(segment))
    .filter(segment => segment.length > 0);
  
  if (folderSegments.length === 0) {
    return cleanFilename;
  }
  
  return `${folderSegments.join('/')}/${cleanFilename}`;
}

/**
 * DownloadOverlay class
 * Manages the download confirmation overlay system using Shadow DOM.
 * Provides a professional UI for confirming and modifying download destinations.
 */
class DownloadOverlay {
  /**
   * Initializes the DownloadOverlay instance.
   * Sets up properties and message listener for background script communication.
   * 
   * Inputs: None
   * Outputs: None (initializes instance properties and listeners)
   */
  constructor() {
    // Shadow DOM root element (isolated styling)
    this.shadowRoot = null;
    // Reference to current overlay DOM element
    this.currentOverlay = null;
    // Interval timer ID for countdown animation
    this.countdownTimer = null;
    // Current download information object
    this.currentDownloadInfo = null;
    // ID of fallback notification if overlay injection fails
    this.fallbackNotificationId = null;
    // Flag indicating if rules editor panel is currently visible
    this.rulesEditorVisible = false;
    // Flag indicating if location picker panel is currently visible
    this.locationPickerVisible = false;
    // Flag indicating if countdown is paused
    this.countdownPaused = false;
    // Remaining time in milliseconds for countdown (default 5 seconds)
    this.timeLeft = 5000; // 5 seconds
    this.init();
  }

  /**
   * Initializes message listener for communication with background script.
   * Listens for download overlay display requests.
   * 
   * Inputs: None
   * Outputs: None (sets up event listener)
   * 
   * External Dependencies:
   *   - chrome.runtime API: For receiving messages from background script
   */
  init() {
    // chrome.runtime.onMessage.addListener: Listens for messages from extension background script
    //   Inputs: Callback function (message, sender, sendResponse)
    //   Outputs: None (sets up listener)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'showDownloadOverlay') {
        // Show overlay with download information
        this.showDownloadOverlay(message.downloadInfo);
      }
    });
  }

  /**
   * Creates the Shadow DOM container for isolated overlay styling.
   * Attaches shadow root to a host element and injects CSS styles.
   * 
   * Inputs: None
   * 
   * Outputs: ShadowRoot object for overlay content injection
   * 
   * External Dependencies:
   *   - document.createElement: Browser DOM API for creating elements
   *   - document.body.appendChild: Browser DOM API for adding elements to page
   *   - attachShadow: Browser Shadow DOM API for creating shadow root
   *   - getCSS: Method in this class that returns CSS string
   */
  createShadowDOM() {
    // Create shadow host element (container in page DOM)
    // document.createElement: Creates new DOM element
    //   Inputs: Tag name string ('div')
    //   Outputs: HTMLElement object
    const host = document.createElement('div');
    host.id = 'download-router-shadow-host';
    // Apply styles to prevent host from interfering with page interactions
    host.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
    `;

    // Create shadow root with closed mode (prevents external access)
    // attachShadow: Creates Shadow DOM root for style isolation
    //   Inputs: Options object { mode: 'closed' }
    //   Outputs: ShadowRoot object
    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // Create and inject CSS styles into shadow root
    const style = document.createElement('style');
    // getCSS: Returns CSS string with all overlay styles
    style.textContent = this.getCSS();
    // appendChild: Adds element to shadow root
    //   Inputs: Element to append
    //   Outputs: Appended element
    this.shadowRoot.appendChild(style);

    // Add host to page body
    // document.body.appendChild: Adds element to page DOM
    //   Inputs: Element to append
    //   Outputs: Appended element
    document.body.appendChild(host);
    return this.shadowRoot;
  }

  /**
   * Returns CSS string containing all styles for the overlay interface.
   * Includes CSS variables, component styles, animations, and dark mode support.
   * 
   * Inputs: None
   * 
   * Outputs: String containing complete CSS stylesheet for overlay
   */
  getCSS() {
    return `
      :host {
        --primary: #ef4444;
        --primary-hover: #dc2626;
        --primary-gradient: linear-gradient(135deg, #ef4444 0%, #f97316 50%, #eab308 100%);
        --success: #10b981;
        --success-hover: #059669;
        --warning: #f59e0b;
        --error: #ef4444;
        --background: rgba(255, 255, 255, 0.95);
        --surface: #f8fafc;
        --surface-elevated: rgba(255, 255, 255, 0.98);
        --border: rgba(0, 0, 0, 0.08);
        --border-subtle: rgba(0, 0, 0, 0.06);
        --text: #1d1d1f;
        --text-secondary: #6e6e73;
        --text-muted: #86868b;
        --shadow-soft: 0 1px 3px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.04);
        --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.03);
        --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.05);
        --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
        --radius: 16px;
        --radius-sm: 10px;
        --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
        --transition-base: 200ms var(--ease-standard);
        --transition-slow: 300ms var(--ease-standard);
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .overlay-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        animation: slideIn var(--transition-slow) var(--ease-standard);
        min-width: 400px;
        max-width: 460px;
        transform: translateZ(0);
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .overlay-content {
        background: var(--surface-elevated);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: var(--radius);
        box-shadow: var(--shadow-xl);
        overflow: hidden;
        position: relative;
      }
      
      .overlay-content::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
        pointer-events: none;
      }

      .overlay-header {
        padding: 24px;
        border-bottom: 1px solid var(--border-subtle);
        position: relative;
      }

      .overlay-title {
        font-size: 16px;
        line-height: 1.3;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 12px;
        letter-spacing: -0.01em;
      }

      .overlay-filename {
        font-size: 15px;
        font-weight: 500;
        color: var(--text);
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        letter-spacing: -0.01em;
      }

      .overlay-filename svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--text);
      }

      .overlay-path {
        font-size: 13px;
        color: var(--text-secondary);
        word-break: break-all;
        line-height: 1.5;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 400;
      }

      .overlay-path svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--text-muted);
      }

      .overlay-actions {
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: rgba(239, 68, 68, 0.02);
      }

      .primary-actions,
      .secondary-actions {
        display: flex;
        gap: 8px;
      }

      .primary-actions {
        justify-content: flex-start;
      }

      .secondary-actions {
        justify-content: center;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-base);
        border: none;
        letter-spacing: -0.01em;
      }

      .btn svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .btn.primary {
        background: linear-gradient(135deg, var(--success), var(--success-hover));
        color: white;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
      }

      .btn.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      }

      .btn.secondary {
        background: var(--surface-elevated);
        color: var(--text);
        border: 1px solid var(--border-subtle);
        box-shadow: var(--shadow-soft);
      }

      .btn.secondary:hover {
        background: var(--surface-elevated);
        border-color: var(--border);
        transform: translateY(-2px);
        box-shadow: var(--shadow-sm);
      }

      .btn.text {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
        transition: all var(--transition-base);
      }

      .btn.text:hover {
        background: var(--surface);
        color: var(--primary);
      }

      .rule-info, .conflict-info {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
        font-size: 12px;
        flex-wrap: wrap;
      }

      .rule-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.5px;
      }

      .rule-badge.domain {
        background: #e3f2fd;
        color: #1976d2;
      }

      .rule-badge.extension {
        background: #f3e5f5;
        color: #7b1fa2;
      }

      .rule-badge.filetype {
        background: #e8f5e9;
        color: #388e3c;
      }

      .priority-badge {
        padding: 2px 6px;
        background: #fef3c7;
        color: #92400e;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
      }

      .rule-value {
        font-size: 11px;
        color: var(--text-secondary);
      }

      .conflict-selector {
        padding: 16px;
        background: #fff9e6;
        border: 1px solid #ffeb3b;
        border-radius: 8px;
        margin: 16px 24px;
      }

      .conflict-title {
        font-weight: 600;
        margin-bottom: 12px;
        color: #d84315;
        font-size: 13px;
      }

      .conflict-badge {
        background: #ffeb3b;
        color: #d84315;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 11px;
      }

      .conflict-option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 4px;
      }

      .conflict-option:hover {
        background: #fff;
      }

      .conflict-option input[type="radio"] {
        margin: 0;
        cursor: pointer;
      }

      .rule-details {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        flex: 1;
      }

      .saveas-editor,
      .rule-editor-inline,
      .group-selector-inline {
        padding: 16px 24px;
        background: var(--surface);
        border-top: 1px solid var(--border);
        margin-top: 0;
      }

      .saveas-editor.hidden,
      .rule-editor-inline.hidden,
      .group-selector-inline.hidden {
        display: none;
      }

      .group-select-inline {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        font-size: 13px;
        background: var(--surface-elevated);
        color: var(--text);
      }

      .action-btn {
        background: var(--surface-elevated);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: var(--text);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        padding: 10px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all var(--transition-base);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        letter-spacing: -0.01em;
        box-shadow: var(--shadow-soft);
      }

      .action-btn svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--text-secondary);
        transition: color var(--transition-base);
      }

      .action-btn:hover {
        background: var(--surface-elevated);
        border-color: var(--primary-color);
        transform: translateY(-2px);
        box-shadow: var(--shadow-sm);
      }
      
      .action-btn:hover svg {
        color: var(--primary);
      }
      
      .action-btn:active {
        transform: translateY(0) scale(0.98);
      }

      .countdown-section {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding-top: 8px;
        border-top: 1px solid var(--border-subtle);
      }

      .countdown-info {
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        font-weight: 400;
      }

      .countdown-bar {
        width: 120px;
        height: 6px;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 3px;
        overflow: hidden;
        flex-shrink: 0;
      }

      .rule-type-buttons {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }

      .rule-type-btn {
        flex: 1;
        padding: 10px 16px;
        border: 2px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text-primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-base);
        text-align: center;
      }

      .rule-type-btn:hover {
        border-color: var(--border);
        background: var(--surface-elevated);
      }

      .rule-type-btn.active {
        border-color: var(--primary-color);
        background: var(--primary-color);
        color: white;
      }

      .rule-editor-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .clickable-folder-input {
        cursor: pointer;
        background: var(--surface-elevated);
      }

      .clickable-folder-input:hover {
        border-color: var(--primary-color);
        background: var(--surface);
      }

      .clickable-folder-input:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
      }

      .countdown-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--success) 0%, var(--success-hover) 50%, var(--warning) 100%);
        border-radius: 3px;
        transition: width 0.05s linear;
        width: 0%;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
      }

      .save-btn {
        background: linear-gradient(135deg, var(--success), var(--success-hover));
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 12px 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: all var(--transition-base);
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        letter-spacing: -0.01em;
        position: relative;
        overflow: hidden;
      }
      
      .save-btn::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        transform: translate(-50%, -50%);
        transition: width 0.4s ease, height 0.4s ease;
      }
      
      .save-btn:active::before {
        width: 300px;
        height: 300px;
      }

      .save-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      }
      
      .save-btn:active {
        transform: translateY(0) scale(0.98);
      }

      .rules-editor {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--surface-elevated);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        border-radius: var(--radius);
        transform: translateY(100%);
        transition: transform var(--transition-slow) var(--ease-standard);
        overflow-y: auto;
        max-height: 500px;
        box-shadow: var(--shadow-xl);
      }

      .rules-editor.visible {
        transform: translateY(0);
      }

      .rules-header {
        padding: 24px;
        border-bottom: 1px solid var(--border-subtle);
        background: rgba(239, 68, 68, 0.03);
      }

      .rules-title {
        font-size: 16px;
        line-height: 1.3;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 8px;
        letter-spacing: -0.01em;
      }

      .rules-info {
        font-size: 13px;
        color: var(--text-secondary);
        font-weight: 400;
        line-height: 1.5;
      }

      .rules-content {
        padding: 24px;
      }

      .rule-type-selector {
        margin-bottom: 20px;
      }

      .rule-type-selector label {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--text);
        cursor: pointer;
      }

      .rule-type-selector input[type="radio"] {
        margin-right: 8px;
      }

      .rule-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .folder-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        font-size: 13px;
        min-width: 120px;
        background: var(--surface-elevated);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: var(--text);
        font-family: inherit;
        transition: all var(--transition-base);
        letter-spacing: -0.01em;
      }
      
      .folder-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        background: var(--surface-elevated);
        color: var(--text);
      }
      
      .folder-input::placeholder {
        color: var(--text-muted);
      }

      .browse-btn {
        background: var(--primary-gradient);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all var(--transition-base);
        box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
        letter-spacing: -0.01em;
      }

      .browse-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(239, 68, 68, 0.4);
      }
      
      .browse-btn:active {
        transform: translateY(0) scale(0.98);
      }

      .target-select {
        padding: 12px 16px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        font-size: 13px;
        background: var(--surface-elevated);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: var(--text);
        font-family: inherit;
        transition: all var(--transition-base);
        letter-spacing: -0.01em;
      }
      
      .target-select:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        background: var(--surface-elevated);
        color: var(--text);
      }

      .priority-hint {
        font-size: 11px;
        color: var(--text-muted);
        font-style: italic;
        margin: 16px 0;
        padding: 8px 12px;
        background: var(--surface);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--primary);
      }

      .rules-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
      }

      .apply-btn {
        background: var(--primary-gradient);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 12px 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all var(--transition-base);
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
        letter-spacing: -0.01em;
      }

      .apply-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
      }
      
      .apply-btn:active {
        transform: translateY(0) scale(0.98);
      }

      .cancel-btn {
        background: var(--surface-elevated);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        color: var(--text);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        padding: 12px 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all var(--transition-base);
        box-shadow: var(--shadow-soft);
        letter-spacing: -0.01em;
      }

      .cancel-btn:hover {
        background: var(--surface-elevated);
        border-color: var(--border);
        transform: translateY(-2px);
        box-shadow: var(--shadow-sm);
      }
      
      .cancel-btn:active {
        transform: translateY(0) scale(0.98);
      }

      .location-picker {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--background);
        border-radius: var(--radius);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        overflow-y: auto;
      }

      .location-picker.visible {
        transform: translateX(0);
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .hidden {
        display: none !important;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --primary: #f87171;
          --primary-hover: #ef4444;
          --primary-gradient: linear-gradient(135deg, #f87171 0%, #fb923c 50%, #fbbf24 100%);
          --background: rgba(26, 26, 26, 0.95);
          --surface: #1a1a1a;
          --surface-elevated: rgba(30, 30, 30, 0.98);
          --border: rgba(255, 255, 255, 0.12);
          --border-subtle: rgba(255, 255, 255, 0.08);
          --text: #f5f5f7;
          --text-secondary: #a1a1a6;
          --text-muted: #86868b;
          --shadow-soft: 0 1px 3px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
          --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3);
          --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.6), 0 4px 6px rgba(0, 0, 0, 0.4);
          --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.7), 0 10px 10px rgba(0, 0, 0, 0.5);
        }
        
        .overlay-content {
          border-color: rgba(255, 255, 255, 0.1);
        }
        
        .overlay-actions {
          background: rgba(248, 113, 113, 0.05);
        }
        
        .rules-header {
          background: rgba(248, 113, 113, 0.05);
          border-bottom-color: rgba(255, 255, 255, 0.08);
        }
        
        .folder-input,
        .target-select {
          background: var(--surface-elevated) !important;
          color: var(--text) !important;
          border-color: var(--border-subtle);
        }
        
        .folder-input:focus,
        .target-select:focus {
          background: var(--surface-elevated) !important;
          color: var(--text) !important;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.1);
        }
        
        .folder-input::placeholder {
          color: var(--text-muted);
        }
        
        .countdown-bar {
          background: rgba(255, 255, 255, 0.12);
        }
      }
    `;
  }

  /**
   * Returns SVG icon markup for common icons used in overlay.
   * Uses inline SVG for shadow DOM compatibility.
   */
  getSVGIcon(iconName) {
    const icons = {
      folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>',
      pencil: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
      image: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>',
      video: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect></svg>',
      music: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
      'file-text': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>',
      archive: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>',
      box: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
      package: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>',
      file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path></svg>',
      check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    };
    return icons[iconName] || icons.file;
  }

  /**
   * Displays the download confirmation overlay with download information.
   * Handles overlay creation, content injection, and fallback to notifications.
   * 
   * Inputs:
   *   - downloadInfo: Object containing download metadata (id, filename, resolvedPath, etc.)
   * 
   * Outputs: None (creates and displays overlay UI)
   * 
   * External Dependencies:
   *   - createShadowDOM: Method in this class to create shadow root
   *   - createOverlayContent: Method in this class to generate HTML content
   *   - setupEventListeners: Method in this class to attach event handlers
   *   - startCountdown: Method in this class to begin auto-save countdown
   *   - showFallbackNotification: Method in this class for error handling
   */
  async showDownloadOverlay(downloadInfo) {
    try {
      // Create shadow DOM if it doesn't exist
      if (!this.shadowRoot) {
        this.createShadowDOM();
      }

      // Store download info and initialize overlay
      this.currentDownloadInfo = downloadInfo;
      // createOverlayContent: Generates and injects HTML into shadow root
      this.createOverlayContent();
      // setupEventListeners: Attaches click handlers and event listeners
      this.setupEventListeners();
      // startCountdown: Begins countdown timer for auto-save
      this.startCountdown();
    } catch (error) {
      // Fall back to notification system if overlay injection fails
      console.error('Failed to show overlay, using fallback notification:', error);
      // showFallbackNotification: Requests background script to show Chrome notification
      this.showFallbackNotification(downloadInfo);
    }
  }

  /**
   * Creates and injects HTML content into the shadow root.
   * Generates overlay structure with header, actions, rules editor, and location picker.
   * 
   * Inputs: None (uses this.currentDownloadInfo)
   * 
   * Outputs: None (updates shadow root innerHTML and stores overlay reference)
   * 
   * External Dependencies:
   *   - this.shadowRoot: Shadow root element created by createShadowDOM
   *   - this.currentDownloadInfo: Download information set by showDownloadOverlay
   */
  createOverlayContent() {
    // Get file icon based on extension
    const fileExt = this.currentDownloadInfo.extension || 'file';
    const iconMap = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'bmp': 'image', 'svg': 'image', 'webp': 'image',
      'mp4': 'video', 'mov': 'video', 'avi': 'video', 'mkv': 'video', 'wmv': 'video', 'flv': 'video', 'webm': 'video',
      'mp3': 'music', 'wav': 'music', 'flac': 'music', 'aac': 'music', 'm4a': 'music',
      'pdf': 'file-text', 'doc': 'file-text', 'docx': 'file-text', 'txt': 'file-text', 'rtf': 'file-text',
      'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 'gz': 'archive',
      'stl': 'box', 'obj': 'box', '3mf': 'box', 'step': 'box', 'stp': 'box', 'ply': 'box',
      'exe': 'package', 'msi': 'package', 'dmg': 'package', 'deb': 'package'
    };
    const fileIcon = iconMap[fileExt.toLowerCase()] || 'file';
    // Format path display - handle absolute destinations
    const formattedPath = formatPathDisplay(
      this.currentDownloadInfo.resolvedPath, 
      this.currentDownloadInfo.absoluteDestination
    );

    // Show matching rule/file type info
    let ruleInfo = '';
    if (this.currentDownloadInfo.finalRule) {
      const source = this.currentDownloadInfo.finalRule.source || 'rule';
      const priority = this.currentDownloadInfo.finalRule.priority !== undefined ? 
        parseFloat(this.currentDownloadInfo.finalRule.priority).toFixed(1) : '2.0';
      const sourceLabel = source === 'domain' ? 'DOMAIN' : 
                         source === 'extension' ? 'EXTENSION' : 
                         source === 'filetype' ? 'FILE TYPE' : 'RULE';
      ruleInfo = `
        <div class="rule-info">
          <span class="rule-badge ${source}">${sourceLabel}</span>
          <span class="priority-badge">Priority ${priority}</span>
          ${this.currentDownloadInfo.finalRule.value ? 
            `<span class="rule-value">${this.currentDownloadInfo.finalRule.value}</span>` : ''}
        </div>
      `;
    } else if (this.currentDownloadInfo.conflictRules && this.currentDownloadInfo.conflictRules.length > 0) {
      ruleInfo = `
        <div class="conflict-info">
          <span class="conflict-badge">⚠ ${this.currentDownloadInfo.conflictRules.length} rules conflict</span>
          <span>Choose below</span>
        </div>
      `;
    }

    const overlayHTML = `
      <div class="overlay-container">
        <div class="overlay-content">
          <div class="overlay-header">
            <div class="overlay-title">Save Download</div>
            <div class="overlay-filename">
              ${this.getSVGIcon(fileIcon)}
              <span>${this.currentDownloadInfo.filename}</span>
            </div>
            ${ruleInfo}
            <div class="overlay-path">
              ${this.getSVGIcon('folder')}
              <span>Saving to: ${formattedPath}</span>
            </div>
          </div>
          
          ${this.currentDownloadInfo.conflictRules && this.currentDownloadInfo.conflictRules.length > 0 ? 
            this.createConflictSelector(this.currentDownloadInfo) : ''}
          
          <div class="overlay-actions">
            <div class="primary-actions">
              <button class="btn primary save-btn">
                ${this.getSVGIcon('check')}
                <span>Save Now</span>
              </button>
              <button class="btn secondary saveas-btn">
                ${this.getSVGIcon('folder')}
                <span>Save As</span>
              </button>
            </div>
            
            <div class="secondary-actions">
              <button class="btn text edit-rule-btn">
                ${this.getSVGIcon('settings')}
                <span>Edit Rule</span>
              </button>
              <button class="btn text add-to-group-btn">
                ${this.getSVGIcon('pencil')}
                <span>Add to File Type</span>
              </button>
            </div>
            
            <div class="countdown-section">
              <div class="countdown-info">Auto-saving in <span id="countdown-seconds">5</span>s</div>
              <div class="countdown-bar">
                <div class="countdown-fill" id="countdown-fill"></div>
              </div>
            </div>
          </div>

          <!-- Inline Save As editor (hidden by default) -->
          <div class="saveas-editor hidden">
            <div class="rules-header">
              <div class="rules-title">Save As</div>
              <div class="rules-info">Choose filename and destination folder</div>
            </div>
            <div class="rules-content">
              <div class="form-group">
                <label class="form-label">Filename</label>
                <input type="text" class="filename-input folder-input" placeholder="Enter filename" value="${this.currentDownloadInfo.filename}">
              </div>
              <div class="form-group">
                <label class="form-label">Save to folder</label>
                <div class="rule-row">
                  <input type="text" class="folder-path-input folder-input" placeholder="Enter folder path" value="${this.currentDownloadInfo.absoluteDestination || (this.currentDownloadInfo.resolvedPath ? this.currentDownloadInfo.resolvedPath.split('/').slice(0, -1).join('/') : '') || 'Downloads'}">
                  <button class="browse-btn">Browse</button>
                </div>
              </div>
              <div class="rules-actions">
                <button class="cancel-btn saveas-cancel">Cancel</button>
                <button class="apply-btn saveas-apply">Save Here</button>
              </div>
            </div>
          </div>
          
          <!-- Inline Edit Rule editor (hidden by default) -->
          <div class="rule-editor-inline hidden">
            <div class="rules-header">
              <div class="rules-title">Edit Routing Rule</div>
            </div>
            <div class="rules-content">
              <div class="rule-type-buttons">
                <button class="rule-type-btn active" data-type="filetype">
                  Add ${this.currentDownloadInfo.extension || 'file type'}
                </button>
                <button class="rule-type-btn" data-type="domain">
                  Add ${this.getBaseDomain(this.currentDownloadInfo.domain) || 'domain'}
                </button>
              </div>
              
              <div class="rule-editor-form">
                <div class="form-group">
                  <label class="form-label">${this.currentDownloadInfo.ruleEditorType === 'domain' ? 'Domain' : 'Extension'}</label>
                  <input type="text" 
                         class="folder-input rule-value-input" 
                         id="rule-value-input"
                         placeholder="${this.currentDownloadInfo.ruleEditorType === 'domain' ? 'e.g., github.com' : 'e.g., .svg,.png,.jpg'}">
                </div>
                <div class="form-group">
                  <label class="form-label">Destination Folder</label>
                  <input type="text" 
                         class="folder-input rule-folder-input clickable-folder-input" 
                         id="rule-folder-input"
                         placeholder="Click to select folder"
                         readonly>
                </div>
              </div>
              
              <div class="rules-actions">
                <button class="cancel-btn rule-editor-cancel">Cancel</button>
                <button class="apply-btn rule-editor-apply">Apply Rule</button>
              </div>
            </div>
          </div>
          
          <!-- Inline Add to File Type selector (hidden by default) -->
          <div class="group-selector-inline hidden">
            <div class="rules-header">
              <div class="rules-title">Add to File Type</div>
              <div class="rules-info">Add .${this.currentDownloadInfo.extension} to an existing file type group</div>
            </div>
            <div class="rules-content">
              <div class="rule-row">
                <select class="group-select-inline">
                  <option value="">Select file type...</option>
                </select>
                <button class="apply-btn add-to-group-confirm">Add</button>
              </div>
              <div class="rules-actions">
                <button class="cancel-btn group-selector-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Preserve style element and append new HTML content
    // querySelector: Finds first matching element in shadow root
    //   Inputs: CSS selector string
    //   Outputs: Element or null
    // outerHTML: Gets element's HTML including itself
    //   Inputs: None
    //   Outputs: HTML string
    this.shadowRoot.innerHTML = this.shadowRoot.querySelector('style').outerHTML + overlayHTML;
    // Store reference to overlay container for later manipulation
    this.currentOverlay = this.shadowRoot.querySelector('.overlay-container');
  }

  /**
   * Attaches event listeners to overlay buttons and interactive elements.
   * Sets up handlers for save, edit rules, change location, and panel navigation.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * 
   * Outputs: None (attaches event listeners to DOM elements)
   * 
   * External Dependencies:
   *   - this.shadowRoot: Shadow root containing overlay elements
   *   - setupRulesEditorEvents: Method in this class to set up rules editor handlers
   *   - setupLocationPickerEvents: Method in this class to set up location picker handlers
   */
  setupEventListeners() {
    const root = this.shadowRoot;
    
    // Attach click handler to Save button
    // querySelector: Finds element by CSS class selector
    //   Inputs: CSS selector string ('.save-btn')
    //   Outputs: Element or null
    // addEventListener: Attaches event handler to element
    //   Inputs: Event type ('click'), callback function
    //   Outputs: None (sets up listener)
    root.querySelector('.save-btn').addEventListener('click', () => {
      // saveDownload: Sends message to background script to proceed with download
      this.saveDownload();
    });
    
    // Save As button - show inline editor
    const saveasBtn = root.querySelector('.saveas-btn');
    if (saveasBtn) {
      saveasBtn.addEventListener('click', () => {
        const editor = root.querySelector('.saveas-editor');
        const ruleEditor = root.querySelector('.rule-editor-inline');
        const groupSelector = root.querySelector('.group-selector-inline');
        
        if (editor) {
          editor.classList.toggle('hidden');
          if (!editor.classList.contains('hidden')) {
            if (ruleEditor) ruleEditor.classList.add('hidden');
            if (groupSelector) groupSelector.classList.add('hidden');
            this.pauseCountdown();
          } else {
            this.resumeCountdown();
          }
        }
      });
    }

    // Edit Rule button - show inline rule editor
    const editRuleBtn = root.querySelector('.edit-rule-btn');
    if (editRuleBtn) {
      editRuleBtn.addEventListener('click', () => {
        const editor = root.querySelector('.rule-editor-inline');
        const saveasEditor = root.querySelector('.saveas-editor');
        const groupSelector = root.querySelector('.group-selector-inline');

        if (editor) {
          editor.classList.toggle('hidden');
          if (!editor.classList.contains('hidden')) {
            if (saveasEditor) saveasEditor.classList.add('hidden');
            if (groupSelector) groupSelector.classList.add('hidden');
            this.pauseCountdown();
            this.initializeRuleEditor();
          } else {
            this.resumeCountdown();
          }
        }
      });
    }

    // Add to File Type button
    const addToGroupBtn = root.querySelector('.add-to-group-btn');
    if (addToGroupBtn) {
      addToGroupBtn.addEventListener('click', () => {
        const selector = root.querySelector('.group-selector-inline');
        const saveasEditor = root.querySelector('.saveas-editor');
        const ruleEditor = root.querySelector('.rule-editor-inline');
        
        if (selector) {
          selector.classList.toggle('hidden');
          if (!selector.classList.contains('hidden')) {
            if (saveasEditor) saveasEditor.classList.add('hidden');
            if (ruleEditor) ruleEditor.classList.add('hidden');
            this.pauseCountdown();
            this.populateGroupSelector();
          } else {
            this.resumeCountdown();
          }
        }
      });
    }

    // Conflict rule selection
    root.querySelectorAll('input[name="conflict-rule"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        if (this.currentDownloadInfo.conflictRules && this.currentDownloadInfo.conflictRules[index]) {
          this.currentDownloadInfo.finalRule = this.currentDownloadInfo.conflictRules[index];
          const isAbsPath = /^(\/|[A-Za-z]:[\\\/])/.test(this.currentDownloadInfo.finalRule.folder);
          if (isAbsPath) {
            this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
            this.currentDownloadInfo.absoluteDestination = this.currentDownloadInfo.finalRule.folder;
            this.currentDownloadInfo.useAbsolutePath = true;
            this.currentDownloadInfo.needsMove = true;
          } else {
            this.currentDownloadInfo.resolvedPath = buildRelativePath(
              this.currentDownloadInfo.finalRule.folder,
              this.currentDownloadInfo.filename
            );
            this.currentDownloadInfo.absoluteDestination = null;
            this.currentDownloadInfo.useAbsolutePath = false;
            this.currentDownloadInfo.needsMove = false;
          }
          // Update display
          this.updatePathDisplay();
        }
      });
    });

    // Inline Save As editor handlers
    const saveasCancelBtn = root.querySelector('.saveas-cancel');
    const saveasApplyBtn = root.querySelector('.saveas-apply');
    if (saveasCancelBtn) {
      saveasCancelBtn.addEventListener('click', () => {
        const editor = root.querySelector('.saveas-editor');
        if (editor) {
          editor.classList.add('hidden');
          this.resumeCountdown();
        }
      });
    }
    if (saveasApplyBtn) {
      saveasApplyBtn.addEventListener('click', () => {
        this.applyLocationChange();
      });
    }

    // Inline Save As browse button
    const saveasBrowseBtn = root.querySelector('.saveas-editor .browse-btn');
    if (saveasBrowseBtn) {
      saveasBrowseBtn.addEventListener('click', () => {
        this.openNativeFolderPicker((selectedPath) => {
          if (selectedPath) {
            const input = root.querySelector('.saveas-editor .folder-path-input');
            if (input) input.value = selectedPath;
          }
        });
      });
    }

    // Inline rule editor handlers
    const ruleEditorCancelBtn = root.querySelector('.rule-editor-cancel');
    const ruleEditorApplyBtn = root.querySelector('.rule-editor-apply');
    if (ruleEditorCancelBtn) {
      ruleEditorCancelBtn.addEventListener('click', () => {
        const editor = root.querySelector('.rule-editor-inline');
        if (editor) {
          editor.classList.add('hidden');
          this.resumeCountdown();
        }
      });
    }
    if (ruleEditorApplyBtn) {
      ruleEditorApplyBtn.addEventListener('click', () => {
        this.applyInlineRuleChanges();
      });
    }

    // Rule editor is initialized via initializeRuleEditor() when opened

    // Inline rule editor browse buttons
    root.querySelectorAll('.rule-editor-inline .inline-browse-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ruleRow = btn.closest('.rule-row');
        const input = ruleRow ? ruleRow.querySelector('.inline-folder-input') : null;
        if (input) {
          this.openNativeFolderPicker((selectedPath) => {
            if (selectedPath) {
              input.value = selectedPath;
            }
          });
        }
      });
    });

    // Inline group selector handlers
    const groupSelectorCancelBtn = root.querySelector('.group-selector-cancel');
    const addToGroupConfirmBtn = root.querySelector('.add-to-group-confirm');
    if (groupSelectorCancelBtn) {
      groupSelectorCancelBtn.addEventListener('click', () => {
        const selector = root.querySelector('.group-selector-inline');
        if (selector) {
          selector.classList.add('hidden');
          this.resumeCountdown();
        }
      });
    }
    if (addToGroupConfirmBtn) {
      addToGroupConfirmBtn.addEventListener('click', () => {
        this.applyAddToGroup();
      });
    }
  }

  /**
   * Attaches event listeners specific to the rules editor panel.
   * Handles rule type selection, target type changes, and apply/cancel actions.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * 
   * Outputs: None (attaches event listeners)
   * 
   * External Dependencies:
   *   - this.shadowRoot: Shadow root containing rules editor elements
   *   - applyRuleChanges: Method in this class to save rule changes
   *   - hideRulesEditor: Method in this class to close rules editor
   */
  setupRulesEditorEvents() {
    // Legacy method - inline editors are now used instead
    // Keep empty for backward compatibility
  }

  setupLocationPickerEvents() {
    // Legacy method - inline Save As editor is now used instead
    // Keep empty for backward compatibility
  }

  /**
   * Displays the rules editor panel and pauses countdown.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * Outputs: None (updates UI and state)
   * 
   * External Dependencies:
   *   - pauseCountdown: Method in this class to stop countdown timer
   */
  showRulesEditor() {
    // Legacy method - inline editor is now used
    // Shows the inline rule editor instead
    this.pauseCountdown();
    const editor = this.shadowRoot.querySelector('.rule-editor-inline');
    if (editor) {
      editor.classList.remove('hidden');
    }
    this.rulesEditorVisible = true;
  }

  hideRulesEditor() {
    // Legacy method - inline editor is now used
    const editor = this.shadowRoot.querySelector('.rule-editor-inline');
    if (editor) {
      editor.classList.add('hidden');
    }
    this.rulesEditorVisible = false;
    this.resumeCountdown();
  }

  showLocationPicker() {
    // Legacy method - inline Save As editor is now used
    this.pauseCountdown();
    const editor = this.shadowRoot.querySelector('.saveas-editor');
    if (editor) {
      editor.classList.remove('hidden');
    }
    this.locationPickerVisible = true;
  }

  /**
   * Hides the location picker panel and resumes countdown.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * Outputs: None (updates UI and state)
   * 
   * External Dependencies:
   *   - resumeCountdown: Method in this class to restart countdown timer
   */
  /**
   * Opens native folder picker via background script.
   * 
   * Inputs:
   *   - callback: Function to call with selected path (or null if cancelled)
   *   - startPath: Optional starting path for the picker
   * 
   * Outputs: None (calls callback asynchronously)
   */
  openNativeFolderPicker(callback, startPath = null) {
    chrome.runtime.sendMessage({
      type: 'pickFolderNative',
      startPath: startPath
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error opening native folder picker:', chrome.runtime.lastError.message);
        if (callback) callback(null);
        return;
      }
      
      if (response && response.success && response.path) {
        if (callback) callback(response.path);
      } else if (response && response.error && !response.error.includes('cancelled')) {
        console.error('Native folder picker error:', response.error);
        if (callback) callback(null);
      } else {
        // User cancelled - call callback with null
        if (callback) callback(null);
      }
    });
  }

  hideLocationPicker() {
    const locationPicker = this.shadowRoot.querySelector('.location-picker');
    if (locationPicker) {
      locationPicker.classList.remove('visible');
    }
    this.locationPickerVisible = false;
    // Resume countdown when picker is closed
    this.resumeCountdown();
  }

  /**
   * Creates conflict selector HTML for when multiple rules match.
   * 
   * Inputs:
   *   - downloadInfo: Object containing conflictRules array
   * 
   * Outputs: String HTML for conflict selector
   */
  createConflictSelector(downloadInfo) {
    const rules = downloadInfo.conflictRules || [];
    if (rules.length === 0) return '';
    
    return `
      <div class="conflict-selector">
        <div class="conflict-title">Multiple rules match - choose one:</div>
        ${rules.map((rule, index) => {
          const priority = rule.priority !== undefined ? parseFloat(rule.priority).toFixed(1) : '2.0';
          const sourceLabel = rule.source === 'domain' ? 'DOMAIN' : 
                             rule.source === 'extension' ? 'EXTENSION' : 
                             rule.source === 'filetype' ? 'FILE TYPE' : 'RULE';
          return `
            <label class="conflict-option">
              <input type="radio" name="conflict-rule" value="${index}" 
                     ${index === 0 ? 'checked' : ''}>
              <span class="rule-badge ${rule.source}">${sourceLabel}</span>
              <span class="rule-details">
                ${rule.value || rule.folder} → ${rule.folder}
                <span class="priority-badge">Priority ${priority}</span>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Updates path display in overlay header.
   */
  updatePathDisplay() {
    const root = this.shadowRoot;
    const formattedPath = formatPathDisplay(
      this.currentDownloadInfo.resolvedPath,
      this.currentDownloadInfo.absoluteDestination
    );
    const pathSpan = root.querySelector('.overlay-path span');
    if (pathSpan) {
      pathSpan.textContent = 'Saving to: ' + formattedPath;
    }
  }

  /**
   * Updates the rule info badge display in the overlay header.
   */
  updateRuleInfoDisplay() {
    const root = this.shadowRoot;
    const ruleInfo = root.querySelector('.rule-info');
    if (!ruleInfo || !this.currentDownloadInfo.finalRule) return;

    const rule = this.currentDownloadInfo.finalRule;
    const source = rule.source || 'rule';
    const priority = rule.priority !== undefined ? parseFloat(rule.priority).toFixed(1) : '2.0';
    const sourceLabel = source === 'domain' ? 'DOMAIN' : 
                       source === 'extension' ? 'EXTENSION' : 
                       source === 'filetype' ? 'FILE TYPE' : 'RULE';
    
    ruleInfo.innerHTML = `
      <span class="rule-badge ${source}">${sourceLabel}</span>
      <span class="priority-badge">Priority ${priority}</span>
      ${rule.value ? `<span class="rule-value">${rule.value}</span>` : ''}
    `;
  }

  /**
   * Extracts base domain from full domain string.
   */
  getBaseDomain(domain) {
    if (!domain) return '';
    // Remove protocol, www, trailing slash
    return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').split('/')[0];
  }

  /**
   * Initializes the rule editor with pre-filled values.
   */
  initializeRuleEditor() {
    const root = this.shadowRoot;
    
    // Get expected folder destination
    const expectedFolder = this.currentDownloadInfo.finalRule?.folder || 
                          this.currentDownloadInfo.absoluteDestination || 
                          (this.currentDownloadInfo.resolvedPath ? 
                            this.currentDownloadInfo.resolvedPath.split('/').slice(0, -1).join('/') : 
                            'Downloads');
    
    // Default to filetype rule
    this.currentDownloadInfo.ruleEditorType = 'filetype';
    
    // Set up rule type buttons
    const typeButtons = root.querySelectorAll('.rule-type-btn');
    typeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        typeButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentDownloadInfo.ruleEditorType = e.target.dataset.type;
        this.updateRuleEditorInputs();
      });
    });
    
    // Prefill inputs
    const valueInput = root.querySelector('#rule-value-input');
    const folderInput = root.querySelector('#rule-folder-input');
    
    if (folderInput) {
      // Extract folder from path (remove filename)
      folderInput.value = expectedFolder;
    }
    
    // Make folder input clickable
    if (folderInput) {
      folderInput.addEventListener('click', () => {
        this.openNativeFolderPicker((selectedPath) => {
          if (selectedPath) {
            folderInput.value = selectedPath;
          }
        });
      });
    }
    
    // Update inputs based on selected type
    this.updateRuleEditorInputs();
  }

  /**
   * Updates rule editor inputs based on selected type.
   */
  updateRuleEditorInputs() {
    const root = this.shadowRoot;
    const valueInput = root.querySelector('#rule-value-input');
    const label = valueInput?.closest('.form-group').querySelector('.form-label');
    
    if (!valueInput) return;
    
    const type = this.currentDownloadInfo.ruleEditorType || 'filetype';
    
    if (label) {
      label.textContent = type === 'domain' ? 'Domain' : 'Extension';
    }
    
    if (type === 'domain') {
      valueInput.value = this.getBaseDomain(this.currentDownloadInfo.domain || '');
      valueInput.placeholder = 'e.g., github.com';
    } else {
      valueInput.value = this.currentDownloadInfo.extension || '';
      valueInput.placeholder = 'e.g., .svg,.png,.jpg';
    }
  }

  /**
   * Applies inline rule changes from overlay.
   */
  async applyInlineRuleChanges() {
    const root = this.shadowRoot;
    const ruleType = this.currentDownloadInfo.ruleEditorType || 'filetype';
    
    const valueInput = root.querySelector('#rule-value-input');
    const folderInput = root.querySelector('#rule-folder-input');
    
    if (!valueInput || !folderInput) return;
    
    let folder = folderInput.value.trim();
    let ruleValue = valueInput.value.trim();
    
    if (!ruleValue) {
      alert(`Please enter a ${ruleType === 'domain' ? 'domain' : 'file extension'}`);
      return;
    }
    
    if (!folder) {
      alert('Please select a folder');
      return;
    }

    const isAbsPath = /^(\/|[A-Za-z]:[\\\/])/.test(folder);
    
    // Normalize domain value for domain rules
    if (ruleType === 'domain' && ruleValue) {
      // Normalize domain (remove protocol, www, trailing slash)
      ruleValue = this.getBaseDomain(ruleValue);
    } else if (ruleType === 'filetype') {
      // Clean up extension list
      ruleValue = ruleValue.replace(/^\./, '').replace(/,/g, ',').split(',').map(ext => ext.trim().replace(/^\./, '')).filter(ext => ext).join(',');
    }
    
    // Send rule to background and wait for it to be saved
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'addRule',
          rule: {
            type: ruleType,
            value: ruleValue,
            folder: folder,
            priority: 2.0,
            enabled: true
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      // Update current download info to use the new rule's path
      if (isAbsPath) {
        this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
        this.currentDownloadInfo.absoluteDestination = folder;
        this.currentDownloadInfo.useAbsolutePath = true;
        this.currentDownloadInfo.needsMove = true;
      } else {
        this.currentDownloadInfo.resolvedPath = buildRelativePath(folder, this.currentDownloadInfo.filename);
        this.currentDownloadInfo.absoluteDestination = null;
        this.currentDownloadInfo.useAbsolutePath = false;
        this.currentDownloadInfo.needsMove = false;
      }
      
      // Update current download info with new rule
      this.currentDownloadInfo.finalRule = {
        type: ruleType,
        value: ruleValue,
        folder: folder,
        source: ruleType === 'domain' ? 'domain' : 'extension',
        priority: 2.0
      };
      this.currentDownloadInfo.matchedRule = this.currentDownloadInfo.finalRule;
      
      // Update rule info display
      this.updatePathDisplay();
      this.updateRuleInfoDisplay();
      
    } catch (error) {
      console.error('Failed to create rule:', error);
      alert('Failed to create rule: ' + error.message);
      return;
    }
    
    // Hide editor
    const editor = root.querySelector('.rule-editor-inline');
    if (editor) {
      editor.classList.add('hidden');
      this.resumeCountdown();
    }
  }

  /**
   * Populates group selector with available file types.
   */
  async populateGroupSelector() {
    const root = this.shadowRoot;
    const select = root.querySelector('.group-select-inline');
    if (!select) return;
    
    try {
      const data = await chrome.storage.sync.get(['groups']);
      const groups = data.groups || {};
      
      select.innerHTML = '<option value="">Select file type...</option>' +
        Object.keys(groups).map(name => {
          return `<option value="${name}">${name} (${groups[name].extensions})</option>`;
        }).join('');
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }

  /**
   * Applies add to group action from overlay.
   */
  applyAddToGroup() {
    const root = this.shadowRoot;
    const select = root.querySelector('.group-select-inline');
    const groupName = select ? select.value : '';
    
    if (!groupName) return;
    
    chrome.runtime.sendMessage({
      type: 'addToGroup',
      extension: this.currentDownloadInfo.extension,
      group: groupName
    });
    
    // Hide selector
    const selector = root.querySelector('.group-selector-inline');
    if (selector) {
      selector.classList.add('hidden');
      this.resumeCountdown();
    }
  }

  /**
   * Applies rule changes from the rules editor to storage.
   * Sends message to background script to add/update rule, then updates overlay display.
   * 
   * Inputs: None (reads form values from shadow root)
   * 
   * Outputs: None (sends message to background script and updates UI)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for sending messages to background script
   *   - this.currentDownloadInfo: Current download information object
   *   - hideRulesEditor: Method in this class to close rules editor
   */
  applyRuleChanges() {
    const root = this.shadowRoot;
    const ruleType = root.querySelector('input[name="ruleType"]:checked').value;
    
    // Helper to check if path is absolute
    const isAbsolutePath = (path) => /^(\/|[A-Za-z]:[\\\/])/.test(path);
    
    if (ruleType === 'domain') {
      const folder = root.querySelector('.domain-rule-config .folder-input').value;
      if (folder) {
        // chrome.runtime.sendMessage: Sends message to background script
        //   Inputs: Message object with type and data
        //   Outputs: None (fire-and-forget message)
        chrome.runtime.sendMessage({
          type: 'addRule',
          rule: {
            type: 'domain',
            value: this.currentDownloadInfo.domain,
            folder: folder
          }
        });
        
        // Check if this is an absolute path (requires post-download move)
        if (isAbsolutePath(folder)) {
          this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
          this.currentDownloadInfo.absoluteDestination = folder;
          this.currentDownloadInfo.useAbsolutePath = true;
          this.currentDownloadInfo.needsMove = true;
        } else {
          // Update resolved path with new folder using path normalization
          this.currentDownloadInfo.resolvedPath = buildRelativePath(folder, this.currentDownloadInfo.filename);
          this.currentDownloadInfo.absoluteDestination = null;
          this.currentDownloadInfo.useAbsolutePath = false;
          this.currentDownloadInfo.needsMove = false;
        }
      }
    } else {
      // Extension rule configuration
      const targetType = root.querySelector('.extension-rule-config .target-select').value;
      if (targetType === 'folder') {
        const folder = root.querySelector('.folder-target .folder-input').value;
        if (folder) {
          chrome.runtime.sendMessage({
            type: 'addRule',
            rule: {
              type: 'extension',
              value: this.currentDownloadInfo.extension,
              folder: folder
            }
          });
          
          // Check if this is an absolute path
          if (isAbsolutePath(folder)) {
            this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
            this.currentDownloadInfo.absoluteDestination = folder;
            this.currentDownloadInfo.useAbsolutePath = true;
            this.currentDownloadInfo.needsMove = true;
          } else {
            this.currentDownloadInfo.resolvedPath = buildRelativePath(folder, this.currentDownloadInfo.filename);
            this.currentDownloadInfo.absoluteDestination = null;
            this.currentDownloadInfo.useAbsolutePath = false;
            this.currentDownloadInfo.needsMove = false;
          }
        }
      } else {
        // Add to existing group
        const group = root.querySelector('.group-target .target-select').value;
        if (group) {
          chrome.runtime.sendMessage({
            type: 'addToGroup',
            extension: this.currentDownloadInfo.extension,
            group: group
          });
        }
      }
    }
    
    // Update overlay display with new path (formatted for display)
    const displayPath = formatPathDisplay(
      this.currentDownloadInfo.resolvedPath,
      this.currentDownloadInfo.absoluteDestination
    );
    const pathSpan = root.querySelector('.overlay-path span');
    if (pathSpan) {
      pathSpan.textContent = 'Saving to: ' + displayPath;
    } else {
      root.querySelector('.overlay-path').innerHTML = `
        ${this.getSVGIcon('folder')}
        <span>Saving to: ${displayPath}</span>
      `;
    }
    // Close rules editor panel
    this.hideRulesEditor();
  }

  /**
   * Applies location change from location picker to current download.
   * Updates resolved path and closes location picker.
   * Handles both absolute paths (from native picker) and relative paths (manual input).
   * 
   * Inputs: None (reads input value from shadow root)
   * 
   * Outputs: None (updates download info and UI)
   */
  applyLocationChange() {
    const root = this.shadowRoot;
    
    // Get filename (may have been edited by user) - check both old and new selectors
    const filenameInput = root.querySelector('.saveas-editor .filename-input') || 
                         root.querySelector('.location-picker .filename-input');
    const newFilename = filenameInput ? filenameInput.value.trim() : this.currentDownloadInfo.filename;
    
    // Get folder path - check both old and new selectors
    const folderInput = root.querySelector('.saveas-editor .folder-path-input') || 
                       root.querySelector('.location-picker .folder-path-input');
    const newLocation = folderInput ? folderInput.value.trim() : '';
    
    // Update filename if changed
    if (newFilename && newFilename !== this.currentDownloadInfo.filename) {
      this.currentDownloadInfo.filename = newFilename;
    }
    
    if (newLocation) {
      // Check if it's an absolute path (starts with / on Unix or C:\ on Windows)
      const isAbsPath = /^(\/|[A-Za-z]:[\\\/])/.test(newLocation);
      
      if (isAbsPath) {
        // Absolute path from native picker - store as-is (will need post-download move)
        this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
        this.currentDownloadInfo.absoluteDestination = newLocation;
        this.currentDownloadInfo.useAbsolutePath = true;
        this.currentDownloadInfo.needsMove = true;
      } else if (newLocation.toLowerCase() === 'downloads') {
        // Downloads root - just use filename
        this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
        this.currentDownloadInfo.absoluteDestination = null;
        this.currentDownloadInfo.useAbsolutePath = false;
        this.currentDownloadInfo.needsMove = false;
      } else {
        // Relative path - normalize and build relative path
        const normalizedPath = normalizePath(newLocation);
        this.currentDownloadInfo.resolvedPath = buildRelativePath(normalizedPath, this.currentDownloadInfo.filename);
        this.currentDownloadInfo.absoluteDestination = null;
        this.currentDownloadInfo.useAbsolutePath = false;
        this.currentDownloadInfo.needsMove = false;
      }
    } else {
      // No folder specified - save to Downloads root with updated filename
      this.currentDownloadInfo.resolvedPath = this.currentDownloadInfo.filename;
      this.currentDownloadInfo.absoluteDestination = null;
      this.currentDownloadInfo.useAbsolutePath = false;
      this.currentDownloadInfo.needsMove = false;
    }
    
    // Update overlay header with new filename
    const filenameSpan = root.querySelector('.overlay-filename span');
    if (filenameSpan) {
      filenameSpan.textContent = this.currentDownloadInfo.filename;
    }
    
    // Update overlay display with formatted path
    this.updatePathDisplay();
    
    // Hide inline editor
    const editor = root.querySelector('.saveas-editor');
    if (editor) {
      editor.classList.add('hidden');
      this.resumeCountdown();
    } else {
      this.hideLocationPicker();
    }
  }

  /**
   * Starts the countdown timer for auto-save functionality.
   * Updates visual progress bar and automatically saves after timeout.
   * 
   * Inputs: None (uses this.timeLeft and elements in this.shadowRoot)
   * 
   * Outputs: None (starts interval timer and updates UI)
   * 
   * External Dependencies:
   *   - setInterval: Browser built-in function for repeated execution
   *   - this.shadowRoot: Shadow root containing countdown bar element
   *   - saveDownload: Method in this class to proceed with download
   */
  startCountdown() {
    // Clear any existing timer first
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    
    // Get reference to countdown progress bar and text elements
    const root = this.shadowRoot;
    const countdownFill = root.querySelector('#countdown-fill');
    const countdownText = root.querySelector('.countdown-info');
    const countdownSeconds = root.querySelector('#countdown-seconds');
    // Reset countdown time to 5 seconds (5000 milliseconds)
    this.timeLeft = 5000; // Reset to 5 seconds
    this.countdownPaused = false;
    // Update interval: update progress bar every 50ms for smooth animation
    const interval = 50; // Update every 50ms
    
    // setInterval: Browser built-in function for repeated execution
    //   Inputs: Callback function, interval in milliseconds
    //   Outputs: Interval ID (stored for cleanup)
    this.countdownTimer = setInterval(() => {
      // Safety check - should never happen since we clear timer when paused
      if (this.countdownPaused) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        return;
      }
      
      // Decrement remaining time
      this.timeLeft -= interval;
      // Calculate percentage complete for progress bar (0-100%)
      const percentage = ((5000 - this.timeLeft) / 5000) * 100;
      // Calculate seconds remaining
      const secondsLeft = Math.ceil(this.timeLeft / 1000);
      
      // Update progress bar width
      // style.width: Sets element's width CSS property
      //   Inputs: Width string with unit (percentage)
      //   Outputs: None (modifies element style)
      if (countdownFill) {
        countdownFill.style.width = percentage + '%';
      }
      
      // Update countdown seconds display
      if (countdownSeconds) {
        countdownSeconds.textContent = secondsLeft > 0 ? secondsLeft : '0';
      }
      
      // Update countdown text
      if (countdownText) {
        if (secondsLeft > 0) {
          countdownText.innerHTML = `Auto-saving in <span id="countdown-seconds">${secondsLeft}</span>s`;
        } else {
          countdownText.textContent = 'Saving now...';
        }
      }
      
      // Auto-save when countdown reaches zero (only if not paused)
      if (this.timeLeft <= 0 && !this.countdownPaused) {
        // clearInterval: Browser built-in function to stop interval
        //   Inputs: Interval ID
        //   Outputs: None (stops interval)
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        // saveDownload: Proceeds with download immediately
        this.saveDownload();
      }
    }, interval);
  }

  /**
   * Pauses the countdown timer.
   * Stops interval execution but preserves current time remaining.
   * 
   * Inputs: None
   * Outputs: None (stops interval timer)
   * 
   * External Dependencies:
   *   - clearInterval: Browser built-in function to stop interval
   */
  pauseCountdown() {
    this.countdownPaused = true;
    if (this.countdownTimer) {
      // clearInterval: Stops the countdown interval completely
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    // Update UI to show paused state
    const root = this.shadowRoot;
    const countdownText = root.querySelector('.countdown-info');
    if (countdownText) {
      const secondsLeft = Math.ceil(this.timeLeft / 1000);
      countdownText.innerHTML = `Paused - <span id="countdown-seconds">${secondsLeft}</span>s remaining`;
    }
  }

  /**
   * Resumes the countdown timer if no editor panels are visible.
   * Restarts from beginning if countdown was paused during panel interaction.
   * 
   * Inputs: None (checks this.rulesEditorVisible and this.locationPickerVisible)
   * Outputs: None (restarts countdown if conditions met)
   * 
   * External Dependencies:
   *   - startCountdown: Method in this class to begin countdown
   */
  resumeCountdown() {
    // Only resume if no editor panels are currently visible
    if (!this.rulesEditorVisible && !this.locationPickerVisible) {
      this.countdownPaused = false;
      // startCountdown: Restarts countdown from beginning
      this.startCountdown();
    }
  }

  /**
   * Sends message to background script to proceed with download.
   * Cleans up overlay UI after sending message.
   * 
   * Inputs: None (uses this.currentDownloadInfo)
   * 
   * Outputs: None (sends message to background script and cleans up)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for sending messages to background script
   *   - this.currentDownloadInfo: Current download information object
   *   - cleanup: Method in this class to remove overlay from DOM
   */
  saveDownload() {
    // Show brief success message before closing
    const overlayHeader = this.shadowRoot.querySelector('.overlay-header');
    if (overlayHeader) {
      overlayHeader.innerHTML = `
        <div class="overlay-title" style="color: var(--success); display: flex; align-items: center; gap: 8px;">
          ${this.getSVGIcon('check')}
          <span>Saved successfully!</span>
        </div>
      `;
      // Style the check icon
      const checkIcon = overlayHeader.querySelector('svg');
      if (checkIcon) {
        checkIcon.style.width = '20px';
        checkIcon.style.height = '20px';
        checkIcon.style.color = 'var(--success)';
      }
    }
    
    // Wait a moment to show success, then proceed
    setTimeout(() => {
      // chrome.runtime.sendMessage: Sends message to background script
      //   Inputs: Message object with type and download info
      //   Outputs: None (fire-and-forget message)
      chrome.runtime.sendMessage({
        type: 'proceedWithDownload',
        downloadInfo: this.currentDownloadInfo
      });
      
      // Remove overlay from page after sending message
      this.cleanup();
    }, 600); // Brief delay to show success message
  }

  /**
   * Cleans up overlay by removing DOM elements and resetting state.
   * Stops countdown timer and removes shadow host from page.
   * 
   * Inputs: None
   * Outputs: None (removes elements and resets properties)
   * 
   * External Dependencies:
   *   - clearInterval: Browser built-in function to stop interval
   *   - document.getElementById: Browser DOM API to find element
   *   - Element.remove: Browser DOM API to remove element from DOM
   */
  cleanup() {
    // Stop countdown timer if running
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    
    // Find and remove shadow host element from page
    // document.getElementById: Finds element by ID
    //   Inputs: ID string
    //   Outputs: Element or null
    const shadowHost = document.getElementById('download-router-shadow-host');
    if (shadowHost) {
      // remove: Removes element from DOM
      //   Inputs: None
      //   Outputs: None (removes element)
      shadowHost.remove();
    }
    // Reset all state properties
    this.shadowRoot = null;
    this.currentOverlay = null;
    this.rulesEditorVisible = false;
    this.locationPickerVisible = false;
  }

  /**
   * Shows fallback Chrome notification when overlay injection fails.
   * Sends message to background script to display system notification.
   * 
   * Inputs:
   *   - downloadInfo: Object containing download metadata
   * 
   * Outputs: None (requests notification via background script)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for sending messages to background script
   *   - saveDownload: Method in this class (fallback if notification also fails)
   */
  async showFallbackNotification(downloadInfo) {
    try {
      // chrome.runtime.sendMessage: Sends message to background script to show notification
      //   Inputs: Message object with type and download info
      //   Outputs: Promise that resolves when message is sent
      this.fallbackNotificationId = await chrome.runtime.sendMessage({
        type: 'showFallbackNotification',
        downloadInfo: downloadInfo
      });
    } catch (error) {
      // If notification also fails, proceed with download immediately (ultimate fallback)
      console.error('Failed to show fallback notification:', error);
      // saveDownload: Proceeds with download without user confirmation
      this.saveDownload();
    }
  }
}

/**
 * Initialize the overlay system when content script loads.
 * Creates a single instance of DownloadOverlay to handle all download confirmations.
 */
// Initialize the overlay system
const downloadOverlay = new DownloadOverlay();