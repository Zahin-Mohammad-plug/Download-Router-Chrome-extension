/**
 * popup.js
 * 
 * Purpose: Popup interface for the Download Router Chrome extension.
 * Role: Displays extension status, statistics, recent activity, and provides quick access
 *       to settings. Serves as the main user-facing control panel.
 * 
 * Key Responsibilities:
 * - Display extension enable/disable status and controls
 * - Show download statistics (total, routed, efficiency metrics)
 * - Display recent download activity history
 * - Provide quick links to options page and help resources
 * - Handle extension state toggling
 * 
 * Architecture:
 * - Single class (PopupApp) manages all popup functionality
 * - Communicates with background.js for statistics retrieval
 * - Updates UI dynamically based on storage data
 */

/**
 * PopupApp class
 * Manages the extension popup interface and user interactions.
 * Handles status display, statistics, and quick actions.
 */
class PopupApp {
  /**
   * Initializes the PopupApp instance.
   * Sets default state and begins initialization process.
   * 
   * Inputs: None
   * Outputs: None (calls init method)
   */
  constructor() {
    // Extension enabled/disabled state (default: enabled)
    this.isExtensionEnabled = true;
    this.init();
  }

  /**
   * Initializes popup interface by loading data and setting up UI.
   * Loads statistics, sets up event handlers, and renders initial display.
   * 
   * Inputs: None
   * Outputs: None (updates UI and sets up listeners)
   * 
   * External Dependencies:
   *   - loadData: Method in this class to retrieve data from storage
   *   - setupEventListeners: Method in this class to attach event handlers
   *   - updateDisplay: Method in this class to render UI
   *   - loadRecentActivity: Method in this class to populate activity list
   */
  async init() {
    // Load extension data and statistics
    await this.loadData();
    // Attach event handlers to UI elements
    this.setupEventListeners();
    // Render initial UI state
    this.updateDisplay();
    // Populate recent activity list
    this.loadRecentActivity();
  }

  /**
   * Loads extension data from Chrome storage and background script.
   * Retrieves rules, groups, extension state, and download statistics.
   * 
   * Inputs: None
   * 
   * Outputs: None (updates instance properties)
   * 
   * External Dependencies:
   *   - chrome.storage.sync: Chrome API for retrieving sync storage data
   *   - chrome.runtime.sendMessage: Chrome API for communicating with background script
   */
  async loadData() {
    // chrome.storage.sync.get: Retrieves data from sync storage
    //   Inputs: Array of keys to retrieve
    //   Outputs: Promise resolving to object with stored values
    const syncData = await chrome.storage.sync.get([
      'rules', 
      'groups', 
      'extensionEnabled'
    ]);
    
    // Get statistics from background script
    // chrome.runtime.sendMessage: Sends message to background script
    //   Inputs: Message object with type 'getStats'
    //   Outputs: Promise resolving to stats object
    const stats = await chrome.runtime.sendMessage({ type: 'getStats' });
    
    // Store retrieved data in instance properties with defaults
    this.rules = syncData.rules || [];
    this.groups = syncData.groups || {};
    // Default to enabled if not explicitly set
    this.isExtensionEnabled = syncData.extensionEnabled !== false;
    // Use default stats if none returned
    this.stats = stats || {
      totalDownloads: 0,
      routedDownloads: 0,
      recentActivity: []
    };
  }

  /**
   * Attaches event listeners to popup UI elements.
   * Sets up handlers for options page, extension toggle, and external links.
   * 
   * Inputs: None (uses DOM elements from popup.html)
   * 
   * Outputs: None (attaches event listeners)
   * 
   * External Dependencies:
   *   - document.getElementById: Browser DOM API to find elements
   *   - addEventListener: Browser DOM API to attach event handlers
   *   - chrome.runtime.openOptionsPage: Chrome API to open options page
   *   - chrome.tabs.create: Chrome API to create new tabs
   *   - toggleExtension: Method in this class to toggle extension state
   */
  setupEventListeners() {
    // Open options page button
    // document.getElementById: Finds element by ID
    //   Inputs: ID string
    //   Outputs: Element or null
    // addEventListener: Attaches event handler
    //   Inputs: Event type ('click'), callback function
    //   Outputs: None (sets up listener)
    document.getElementById('open-options').addEventListener('click', () => {
      // chrome.runtime.openOptionsPage: Opens extension options page
      //   Inputs: None (optional callback)
      //   Outputs: Opens options.html in new tab
      chrome.runtime.openOptionsPage();
    });

    // Toggle extension enable/disable button
    document.getElementById('toggle-extension').addEventListener('click', () => {
      // toggleExtension: Toggles extension state and updates UI
      this.toggleExtension();
    });

    // Help link - opens README in new tab
    document.getElementById('help-link').addEventListener('click', (e) => {
      // preventDefault: Prevents default anchor link behavior
      //   Inputs: None
      //   Outputs: None (prevents navigation)
      e.preventDefault();
      // chrome.tabs.create: Creates new tab with specified URL
      //   Inputs: Object with url property
      //   Outputs: Promise resolving to Tab object
      chrome.tabs.create({ url: 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension#readme' });
    });

    // Feedback link - opens GitHub issues page in new tab
    document.getElementById('feedback-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues' });
    });
  }

  /**
   * Updates popup UI display with current statistics and extension state.
   * Renders rule counts, group counts, download counts, and toggle button state.
   * 
   * Inputs: None (uses instance properties: this.rules, this.groups, this.stats, this.isExtensionEnabled)
   * 
   * Outputs: None (updates DOM elements)
   * 
   * External Dependencies:
   *   - document.getElementById: Browser DOM API to find elements
   *   - textContent: DOM property to set element text
   *   - Object.keys: JavaScript built-in to get object keys
   *   - classList.add/remove: DOM API to modify element classes
   */
  updateDisplay() {
    // Update statistics displays
    // textContent: Sets element's text content
    //   Inputs: String text
    //   Outputs: None (modifies element)
    document.getElementById('rules-count').textContent = this.rules.length;
    // Object.keys: Returns array of object's own property names
    //   Inputs: Object
    //   Outputs: Array of strings
    document.getElementById('groups-count').textContent = Object.keys(this.groups).length;
    document.getElementById('downloads-count').textContent = this.stats.totalDownloads;

    // Update extension toggle button appearance based on state
    const toggleBtn = document.getElementById('toggle-extension');
    const toggleIcon = document.getElementById('toggle-icon');
    const toggleText = document.getElementById('toggle-text');
    const statusIndicator = document.getElementById('status-indicator');

    if (this.isExtensionEnabled) {
      // Extension is enabled - show pause option
      toggleIcon.textContent = '⏸️';
      toggleText.textContent = 'Pause';
      // classList.remove: Removes CSS class from element
      //   Inputs: Class name string
      //   Outputs: None (modifies element)
      toggleBtn.classList.remove('disabled');
      // style.background: Sets element's background-color CSS property
      //   Inputs: Color value string
      //   Outputs: None (modifies element style)
      statusIndicator.style.background = 'var(--success-color)';
    } else {
      // Extension is disabled - show resume option
      toggleIcon.textContent = '▶️';
      toggleText.textContent = 'Resume';
      // classList.add: Adds CSS class to element
      toggleBtn.classList.add('disabled');
      statusIndicator.style.background = 'var(--error-color)';
    }
  }

  /**
   * Loads and displays recent download activity in the popup.
   * Shows up to 5 most recent downloads or empty state if none exist.
   * 
   * Inputs: None (uses this.stats.recentActivity)
   * 
   * Outputs: None (updates activity list DOM)
   * 
   * External Dependencies:
   *   - document.getElementById: Browser DOM API to find element
   *   - innerHTML: DOM property to set element HTML content
   *   - Array.slice: JavaScript array method to extract subset
   *   - Array.map: JavaScript array method to transform elements
   *   - Array.join: JavaScript array method to combine strings
   *   - createActivityItem: Method in this class to generate activity HTML
   */
  loadRecentActivity() {
    const activityList = document.getElementById('activity-list');
    const activities = this.stats.recentActivity || [];
    
    // Show empty state if no activities
    if (activities.length === 0) {
      // innerHTML: Sets element's HTML content
      //   Inputs: HTML string
      //   Outputs: None (replaces element content)
      activityList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>No recent downloads</p>
        </div>
      `;
      return;
    }

    // Generate HTML for activity items
    // slice: Returns array subset (first 5 items)
    //   Inputs: Start index (0), end index (5)
    //   Outputs: New array with subset elements
    // map: Transforms each activity to HTML string
    //   Inputs: Transform function (createActivityItem)
    //   Outputs: Array of HTML strings
    // join: Combines array elements into single string
    //   Inputs: Separator string ('')
    //   Outputs: Combined string
    activityList.innerHTML = activities
      .slice(0, 5) // Show only last 5
      .map(activity => this.createActivityItem(activity))
      .join('');
  }

  /**
   * Creates HTML string for a single activity item in the recent activity list.
   * Formats filename, folder path, timestamp, and routing status.
   * 
   * Inputs:
   *   - activity: Object containing activity data:
   *     - filename: String name of downloaded file
   *     - folder: String destination folder
   *     - timestamp: Number milliseconds since epoch
   *     - routed: Boolean indicating if rule was applied
   * 
   * Outputs: String containing HTML for activity item
   * 
   * External Dependencies:
   *   - getTimeAgo: Method in this class to format timestamp
   *   - getFileIcon: Method in this class to get icon for file type
   */
  createActivityItem(activity) {
    // Format relative time (e.g., "5m ago", "2h ago")
    // getTimeAgo: Converts timestamp to human-readable relative time
    const timeAgo = this.getTimeAgo(activity.timestamp);
    // Get appropriate icon for file type
    // getFileIcon: Returns emoji icon based on file extension
    const icon = this.getFileIcon(activity.filename);
    // Show routing badge if file was routed by a rule
    const routedBadge = activity.routed ? '<span class="routed-badge">📁</span>' : '';
    
    // Generate HTML template string with activity data
    return `
      <div class="activity-item ${activity.routed ? 'routed' : ''}">
        <div class="activity-icon">${icon}</div>
        <div class="activity-info">
          <div class="activity-filename" title="${activity.filename}">${activity.filename} ${routedBadge}</div>
          <div class="activity-path" title="${activity.folder}">${activity.folder}</div>
        </div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    `;
  }

  /**
   * Returns emoji icon for a file extension.
   * Maps common file extensions to appropriate icons.
   * 
   * Inputs:
   *   - extension: String file extension (with or without dot, e.g. 'pdf' or '.pdf')
   * 
   * Outputs: String emoji icon or default icon
   * 
   * Note: This is a helper method. The actual implementation uses filename.
   */
  getFileIcon(extension) {
    const iconMap = {
      // Images
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
      // Videos
      'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'wmv': '🎬',
      // Audio
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'm4a': '🎵',
      // Documents
      'pdf': '📄', 'doc': '📄', 'docx': '📄', 'txt': '📄', 'rtf': '📄',
      // 3D Files
      'stl': '🎲', 'obj': '🎲', '3mf': '🎲', 'step': '🎲',
      // Archives
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
      // Software
      'exe': '⚙️', 'msi': '⚙️', 'dmg': '⚙️', 'deb': '⚙️',
      // Default
      'default': '📁'
    };
    
    return iconMap[extension.toLowerCase()] || iconMap.default;
  }

  /**
   * Converts timestamp to human-readable relative time string.
   * Formats as "Xd ago", "Xh ago", "Xm ago", or "Just now".
   * 
   * Inputs:
   *   - timestamp: Number milliseconds since epoch
   * 
   * Outputs: String relative time description
   * 
   * External Dependencies:
   *   - Date.now: JavaScript built-in function to get current timestamp
   *   - Math.floor: JavaScript built-in function to round down
   */
  getTimeAgo(timestamp) {
    // Date.now: Returns current timestamp in milliseconds
    //   Inputs: None
    //   Outputs: Number (milliseconds since epoch)
    const now = Date.now();
    // Calculate time difference in milliseconds
    const diff = now - timestamp;
    // Convert to different time units
    // Math.floor: Rounds number down to nearest integer
    //   Inputs: Number
    //   Outputs: Integer
    const minutes = Math.floor(diff / 60000); // 60,000 ms = 1 minute
    const hours = Math.floor(diff / 3600000); // 3,600,000 ms = 1 hour
    const days = Math.floor(diff / 86400000); // 86,400,000 ms = 1 day

    // Return appropriate time format based on duration
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  /**
   * Toggles extension enabled/disabled state.
   * Saves state to storage, notifies background script, and updates UI.
   * 
   * Inputs: None (toggles this.isExtensionEnabled)
   * 
   * Outputs: None (updates state, storage, and UI)
   * 
   * External Dependencies:
   *   - chrome.storage.sync.set: Chrome API for saving state
   *   - chrome.runtime.sendMessage: Chrome API for notifying background script
   *   - updateDisplay: Method in this class to refresh UI
   *   - showToast: Method in this class to display feedback
   */
  async toggleExtension() {
    // Toggle extension state
    this.isExtensionEnabled = !this.isExtensionEnabled;
    
    // Save new state to sync storage
    // chrome.storage.sync.set: Stores data in sync storage
    //   Inputs: Object with key-value pairs
    //   Outputs: Promise resolving when stored
    await chrome.storage.sync.set({ 
      extensionEnabled: this.isExtensionEnabled 
    });
    
    // Notify background script of state change
    // chrome.runtime.sendMessage: Sends message to background script
    //   Inputs: Message object with type and data
    //   Outputs: None (fire-and-forget message)
    chrome.runtime.sendMessage({
      type: 'toggleExtension',
      enabled: this.isExtensionEnabled
    });
    
    // Refresh UI to reflect new state
    this.updateDisplay();
    
    // Show user feedback toast notification
    // showToast: Displays temporary notification message
    this.showToast(
      this.isExtensionEnabled 
        ? 'Extension enabled' 
        : 'Extension paused'
    );
  }

  /**
   * Displays a temporary toast notification message.
   * Creates, animates, and automatically removes toast after 2 seconds.
   * 
   * Inputs:
   *   - message: String message to display in toast
   * 
   * Outputs: None (creates and removes DOM element)
   * 
   * External Dependencies:
   *   - document.createElement: Browser DOM API to create element
   *   - document.body.appendChild: Browser DOM API to add element
   *   - setTimeout: Browser built-in function for delayed execution
   *   - Element.remove: Browser DOM API to remove element
   */
  showToast(message) {
    // Create toast notification element
    // document.createElement: Creates new DOM element
    //   Inputs: Tag name string ('div')
    //   Outputs: HTMLElement object
    const toast = document.createElement('div');
    // Apply inline styles for positioning and appearance
    // cssText: Sets element's inline CSS as string
    //   Inputs: CSS string
    //   Outputs: None (applies styles)
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface);
      color: var(--text-primary);
      padding: 8px 16px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-md);
      font-size: 12px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    // textContent: Sets element's text content
    toast.textContent = message;
    
    // Add toast to page
    // document.body.appendChild: Adds element to page body
    //   Inputs: Element to append
    //   Outputs: Appended element
    document.body.appendChild(toast);
    
    // Remove toast after 2 seconds with slide-out animation
    // setTimeout: Executes callback after delay
    //   Inputs: Callback function, delay in milliseconds (2000 = 2 seconds)
    //   Outputs: Timeout ID (not stored)
    setTimeout(() => {
      // Trigger slide-out animation
      toast.style.animation = 'slideOut 0.3s ease';
      // Remove element after animation completes
      setTimeout(() => {
        // remove: Removes element from DOM
        //   Inputs: None
        //   Outputs: None (removes element)
        toast.remove();
      }, 300); // Wait for animation duration
    }, 2000);
  }

  /**
   * Returns emoji icon based on file extension extracted from filename.
   * Maps common file types to appropriate visual icons.
   * 
   * Inputs:
   *   - filename: String filename (may include extension)
   * 
   * Outputs: String emoji icon character
   */
  getFileIcon(filename) {
    // Extract file extension from filename
    // split: Splits string by delimiter into array
    //   Inputs: Delimiter string ('.')
    //   Outputs: Array of strings
    // pop: Removes and returns last array element
    //   Inputs: None
    //   Outputs: Last element or undefined
    // toLowerCase: Converts string to lowercase
    //   Inputs: None
    //   Outputs: Lowercase string
    const extension = filename.split('.').pop().toLowerCase();
    const iconMap = {
      // Images
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️',
      // Videos
      'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬', 'wmv': '🎬', 'flv': '🎬',
      // Audio
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵',
      // Documents
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝', 'rtf': '📝',
      // Archives
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
      // Code
      'js': '💻', 'html': '💻', 'css': '💻', 'py': '💻', 'cpp': '💻',
      // 3D Files
      'stl': '🧊', 'obj': '🧊', '3mf': '🧊',
      // Software
      'exe': '⚙️', 'msi': '⚙️', 'dmg': '⚙️', 'deb': '⚙️'
    };
    
    return iconMap[extension] || '📄';
  }
}

/**
 * Add CSS animations for toast notifications.
 * Defines slide-in and slide-out animations for toast elements.
 */
// document.createElement: Creates style element for CSS animations
const style = document.createElement('style');
// textContent: Sets CSS keyframe definitions
style.textContent = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  
  @keyframes slideOut {
    from { opacity: 1; transform: translateX(-50%) translateY(0); }
    to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  }
`;
// document.head.appendChild: Adds style element to page head
//   Inputs: Element to append
//   Outputs: Appended element
document.head.appendChild(style);

/**
 * Initialize popup app when DOM content is fully loaded.
 * Creates PopupApp instance to manage popup interface.
 */
// document.addEventListener: Listens for DOMContentLoaded event
//   Inputs: Event type ('DOMContentLoaded'), callback function
//   Outputs: None (sets up listener)
document.addEventListener('DOMContentLoaded', () => {
  // Create PopupApp instance to initialize popup interface
  new PopupApp();
});
