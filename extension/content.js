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
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        background: rgba(239, 68, 68, 0.02);
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
        flex: 1;
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
    const formattedPath = formatPathDisplay(this.currentDownloadInfo.resolvedPath);

    const overlayHTML = `
      <div class="overlay-container">
        <div class="overlay-content">
          <div class="overlay-header">
            <div class="overlay-title">Saving your download...</div>
            <div class="overlay-filename">
              ${this.getSVGIcon(fileIcon)}
              <span>${this.currentDownloadInfo.filename}</span>
            </div>
            <div class="overlay-path">
              ${this.getSVGIcon('folder')}
              <span>Saving to: ${formattedPath}</span>
            </div>
          </div>
          
          <div class="overlay-actions">
            <button class="action-btn edit-rules-btn">
              ${this.getSVGIcon('pencil')}
              <span>Edit Rules</span>
            </button>
            <button class="action-btn change-location-btn">
              ${this.getSVGIcon('folder')}
              <span>Change Location</span>
            </button>
            
            <div class="countdown-section">
              <div class="countdown-info" id="countdown-text">Auto-saving in 5s...</div>
              <div class="countdown-bar">
                <div class="countdown-fill" id="countdown-fill"></div>
              </div>
              <button class="save-btn">Save Now</button>
            </div>
          </div>

          <div class="rules-editor">
            <div class="rules-header">
              <div class="rules-title">Edit Routing Rules</div>
              <div class="rules-info">Domain: ${this.currentDownloadInfo.domain} • Type: .${this.currentDownloadInfo.extension}</div>
            </div>
            <div class="rules-content">
              <div class="rule-type-selector">
                <label>
                  <input type="radio" name="ruleType" value="domain" checked>
                  Route domain → folder
                </label>
                <label>
                  <input type="radio" name="ruleType" value="extension">
                  Route file type → group/folder
                </label>
              </div>
              
              <div class="domain-rule-config">
                <div class="rule-row">
                  <span>${this.currentDownloadInfo.domain}</span> → 
                  <input type="text" class="folder-input" placeholder="Choose folder">
                  <button class="browse-btn">Browse</button>
                </div>
              </div>
              
              <div class="extension-rule-config hidden">
                <div class="rule-row">
                  Map .${this.currentDownloadInfo.extension} to:
                  <select class="target-select">
                    <option value="folder">A Folder</option>
                    <option value="group">A Group</option>
                  </select>
                </div>
                <div class="folder-target">
                  <div class="rule-row">
                    <input type="text" class="folder-input" placeholder="Choose folder">
                    <button class="browse-btn">Browse</button>
                  </div>
                </div>
                <div class="group-target hidden">
                  <div class="rule-row">
                    <select class="target-select">
                      <option value="">Select a group...</option>
                      <option value="videos">Videos (mp4, mov, mkv, avi)</option>
                      <option value="images">Images (jpg, jpeg, png, gif, bmp)</option>
                      <option value="documents">Documents (pdf, doc, docx, txt)</option>
                      <option value="3d-files">3D Files (stl, obj, 3mf, step)</option>
                      <option value="archives">Archives (zip, rar, 7z, tar)</option>
                      <option value="software">Software (exe, msi, dmg, deb)</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="priority-hint">
                Priority: Domain rules > Group/Filetype rules > Default folder
              </div>
              
              <div class="rules-actions">
                <button class="cancel-btn">Cancel</button>
                <button class="apply-btn">Apply Rule</button>
              </div>
            </div>
          </div>

          <div class="location-picker">
            <div class="rules-header">
              <div class="rules-title">Change Download Location</div>
              <div class="rules-info">Select a new folder for this download</div>
            </div>
            <div class="rules-content">
              <div class="rule-row">
                <input type="text" class="folder-input" placeholder="Enter folder path" value="${this.currentDownloadInfo.resolvedPath}">
                <button class="browse-btn">Browse</button>
              </div>
              <div class="rules-actions">
                <button class="cancel-btn">Cancel</button>
                <button class="apply-btn">Update Location</button>
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
    
    // Attach click handler to Edit Rules button
    root.querySelector('.edit-rules-btn').addEventListener('click', () => {
      // showRulesEditor: Displays rules editor panel
      this.showRulesEditor();
    });
    
    // Attach click handler to Change Location button
    root.querySelector('.change-location-btn').addEventListener('click', () => {
      // showLocationPicker: Displays location picker panel
      this.showLocationPicker();
    });
    
    // Set up additional event handlers for panels
    // setupRulesEditorEvents: Attaches handlers for rules editor interactions
    this.setupRulesEditorEvents();
    // setupLocationPickerEvents: Attaches handlers for location picker interactions
    this.setupLocationPickerEvents();
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
    const root = this.shadowRoot;
    
    // Attach change handlers to rule type radio buttons (domain vs extension)
    // querySelectorAll: Finds all matching elements
    //   Inputs: CSS selector string ('input[name="ruleType"]')
    //   Outputs: NodeList of elements
    // forEach: Iterates over NodeList
    //   Inputs: Callback function
    //   Outputs: None (executes callback for each element)
    root.querySelectorAll('input[name="ruleType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        // Get references to configuration panels
        const domainConfig = root.querySelector('.domain-rule-config');
        const extensionConfig = root.querySelector('.extension-rule-config');
        
        // Toggle visibility based on selected rule type
        // classList.remove/add: Modifies element's class list
        //   Inputs: Class name string
        //   Outputs: None (modifies element)
        if (e.target.value === 'domain') {
          domainConfig.classList.remove('hidden');
          extensionConfig.classList.add('hidden');
        } else {
          domainConfig.classList.add('hidden');
          extensionConfig.classList.remove('hidden');
        }
      });
    });
    
    // Target type selector
    const targetSelect = root.querySelector('.extension-rule-config .target-select');
    if (targetSelect) {
      targetSelect.addEventListener('change', (e) => {
        const folderTarget = root.querySelector('.folder-target');
        const groupTarget = root.querySelector('.group-target');
        
        if (e.target.value === 'folder') {
          folderTarget.classList.remove('hidden');
          groupTarget.classList.add('hidden');
        } else {
          folderTarget.classList.add('hidden');
          groupTarget.classList.remove('hidden');
        }
      });
    }
    
    // Apply button
    root.querySelector('.rules-editor .apply-btn').addEventListener('click', () => {
      this.applyRuleChanges();
    });
    
    // Cancel button
    root.querySelector('.rules-editor .cancel-btn').addEventListener('click', () => {
      this.hideRulesEditor();
    });
  }

  /**
   * Attaches event listeners specific to the location picker panel.
   * Handles apply and cancel actions for location changes.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * 
   * Outputs: None (attaches event listeners)
   * 
   * External Dependencies:
   *   - this.shadowRoot: Shadow root containing location picker elements
   *   - applyLocationChange: Method in this class to save location change
   *   - hideLocationPicker: Method in this class to close location picker
   */
  setupLocationPickerEvents() {
    const root = this.shadowRoot;
    
    // Apply button
    root.querySelector('.location-picker .apply-btn').addEventListener('click', () => {
      this.applyLocationChange();
    });
    
    // Cancel button
    root.querySelector('.location-picker .cancel-btn').addEventListener('click', () => {
      this.hideLocationPicker();
    });
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
    // Pause countdown while user interacts with editor
    this.pauseCountdown();
    const rulesEditor = this.shadowRoot.querySelector('.rules-editor');
    rulesEditor.classList.add('visible');
    this.rulesEditorVisible = true;
  }

  /**
   * Hides the rules editor panel and resumes countdown.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * Outputs: None (updates UI and state)
   * 
   * External Dependencies:
   *   - resumeCountdown: Method in this class to restart countdown timer
   */
  hideRulesEditor() {
    const rulesEditor = this.shadowRoot.querySelector('.rules-editor');
    rulesEditor.classList.remove('visible');
    this.rulesEditorVisible = false;
    // Resume countdown when editor is closed
    this.resumeCountdown();
  }

  /**
   * Displays the location picker panel and pauses countdown.
   * 
   * Inputs: None (uses elements in this.shadowRoot)
   * Outputs: None (updates UI and state)
   * 
   * External Dependencies:
   *   - pauseCountdown: Method in this class to stop countdown timer
   */
  showLocationPicker() {
    // Pause countdown while user interacts with location picker
    this.pauseCountdown();
    const locationPicker = this.shadowRoot.querySelector('.location-picker');
    locationPicker.classList.add('visible');
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
  hideLocationPicker() {
    const locationPicker = this.shadowRoot.querySelector('.location-picker');
    locationPicker.classList.remove('visible');
    this.locationPickerVisible = false;
    // Resume countdown when picker is closed
    this.resumeCountdown();
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
        // Update resolved path with new folder using path normalization
        this.currentDownloadInfo.resolvedPath = buildRelativePath(folder, this.currentDownloadInfo.filename);
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
          this.currentDownloadInfo.resolvedPath = buildRelativePath(folder, this.currentDownloadInfo.filename);
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
    
    // Update overlay display with new resolved path
    // textContent: Sets element's text content
    //   Inputs: String text content
    //   Outputs: None (modifies element)
    root.querySelector('.overlay-path').textContent = this.currentDownloadInfo.resolvedPath;
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
    const newLocation = root.querySelector('.location-picker .folder-input').value;
    if (newLocation) {
      // Check if it's an absolute path (starts with / on Unix or C:\ on Windows)
      const isAbsolutePath = /^(\/|[A-Za-z]:\\)/.test(newLocation);
      
      if (isAbsolutePath) {
        // Absolute path from native picker - store as-is (will need post-download move)
      this.currentDownloadInfo.resolvedPath = newLocation;
        this.currentDownloadInfo.useAbsolutePath = true; // Flag for post-download move
      } else {
        // Relative path - normalize and build relative path
        const normalizedPath = normalizePath(newLocation);
        if (normalizedPath.includes('/')) {
          this.currentDownloadInfo.resolvedPath = normalizedPath;
        } else {
          this.currentDownloadInfo.resolvedPath = buildRelativePath(normalizedPath, this.currentDownloadInfo.filename);
        }
        this.currentDownloadInfo.useAbsolutePath = false;
      }
      root.querySelector('.overlay-path').textContent = this.currentDownloadInfo.resolvedPath;
    }
    this.hideLocationPicker();
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
    // Get reference to countdown progress bar and text elements
    const countdownFill = this.shadowRoot.querySelector('#countdown-fill');
    const countdownText = this.shadowRoot.querySelector('#countdown-text');
    // Reset countdown time to 5 seconds (5000 milliseconds)
    this.timeLeft = 5000; // Reset to 5 seconds
    // Update interval: update progress bar every 50ms for smooth animation
    const interval = 50; // Update every 50ms
    
    // setInterval: Browser built-in function for repeated execution
    //   Inputs: Callback function, interval in milliseconds
    //   Outputs: Interval ID (stored for cleanup)
    this.countdownTimer = setInterval(() => {
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
      
      // Update countdown text
      if (countdownText) {
        if (secondsLeft > 0) {
          countdownText.textContent = `Auto-saving in ${secondsLeft}s...`;
        } else {
          countdownText.textContent = 'Saving now...';
        }
      }
      
      // Auto-save when countdown reaches zero
      if (this.timeLeft <= 0) {
        // clearInterval: Browser built-in function to stop interval
        //   Inputs: Interval ID
        //   Outputs: None (stops interval)
        clearInterval(this.countdownTimer);
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
    if (this.countdownTimer) {
      // clearInterval: Stops the countdown interval
      clearInterval(this.countdownTimer);
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