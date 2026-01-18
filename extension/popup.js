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
    // Current tab URL for matching rules
    this.currentTabUrl = null;
    // Modal state tracking
    this.editingRuleIndex = null;
    this.editingGroupName = null;
    this.newlyAddedRuleIndex = null;
    this.newlyAddedGroupName = null;
    this.folderPickerOpen = false;
    this.folderSelectCallback = null;
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
    // Get current tab URL for matching rules
    await this.getCurrentTabUrl();
    // Load extension data and statistics
    await this.loadData();
    // Attach event handlers to UI elements
    this.setupEventListeners();
    // Setup modal listeners
    this.setupModalListeners();
    // Render initial UI state
    this.updateDisplay();
    // Populate recent activity list
    this.loadRecentActivity();
    // Update "+ Add" button with current site
    this.updateAddRuleButton();
    
    // Check for flags from content.js to auto-open modals
    const storageData = await chrome.storage.local.get([
      'openEditRuleInPopup',
      'editRuleData',
      'openEditGroupInPopup',
      'editGroupName'
    ]);
    
    if (storageData.openEditRuleInPopup && storageData.editRuleData) {
      await chrome.storage.local.remove(['openEditRuleInPopup', 'editRuleData']);
      // Find rule index by matching rule properties
      const ruleData = storageData.editRuleData;
      // Match by type (or source if type not available) and value
      const ruleIndex = this.rules.findIndex(r => {
        const ruleType = r.type || r.source || '';
        const dataType = ruleData.type || ruleData.source || '';
        return ruleType === dataType && 
               r.value === ruleData.value;
      });
      if (ruleIndex !== -1) {
        setTimeout(() => {
          this.openEditRuleModal(ruleIndex);
        }, 200);
      } else {
        // If exact match not found, try to find by value only (in case folder changed)
        const fallbackIndex = this.rules.findIndex(r => {
          const ruleType = r.type || r.source || '';
          const dataType = ruleData.type || ruleData.source || '';
          return ruleType === dataType && r.value === ruleData.value;
        });
        if (fallbackIndex !== -1) {
          setTimeout(() => {
            this.openEditRuleModal(fallbackIndex);
          }, 200);
        }
      }
    }
    
    if (storageData.openEditGroupInPopup && storageData.editGroupName) {
      await chrome.storage.local.remove(['openEditGroupInPopup', 'editGroupName']);
      const groupName = storageData.editGroupName;
      if (this.groups[groupName]) {
        setTimeout(() => {
          this.openEditGroupModal(groupName);
        }, 200);
      }
    }
  }

  /**
   * Gets the current active tab's URL to match rules against.
   */
  async getCurrentTabUrl() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].url) {
        this.currentTabUrl = tabs[0].url;
      }
    } catch (error) {
      console.error('Failed to get current tab URL:', error);
      this.currentTabUrl = null;
    }
  }

  /**
   * Extracts domain from URL
   */
  extractDomain(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
      return null;
    }
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
    // Open options page button (header)
    document.getElementById('open-options-header').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Toggle extension enable/disable button (header)
    document.getElementById('toggle-extension-header').addEventListener('click', () => {
      this.toggleExtension();
    });
    
    // Handle clicks on activity items to open folder
    document.addEventListener('click', (e) => {
      const activityItem = e.target.closest('.activity-item[data-file-path], .activity-item[data-download-id]');
      if (activityItem) {
        const filePath = activityItem.dataset.filePath;
        const downloadId = activityItem.dataset.downloadId ? parseInt(activityItem.dataset.downloadId, 10) : null;
        if (filePath || downloadId) {
          chrome.runtime.sendMessage({
            type: 'openFolder',
            path: filePath || '',
            downloadId: downloadId
          }).catch((error) => {
            console.error('Error opening folder:', error);
          });
        }
      }
    });

    // Clear recent activity button
    const clearActivityBtn = document.getElementById('clear-activity');
    if (clearActivityBtn) {
      clearActivityBtn.addEventListener('click', async () => {
        if (confirm('Clear all recent downloads?')) {
          await chrome.storage.local.set({
            downloadStats: {
              totalDownloads: this.stats.totalDownloads,
              routedDownloads: this.stats.routedDownloads,
              recentActivity: [] // Clear activity
            }
          });
          this.stats.recentActivity = [];
          this.loadRecentActivity();
          this.showToast('Recent activity cleared');
        }
      });
    }

    // Add rule quick button - now opens modal instead of redirecting
    const addRuleQuickBtn = document.getElementById('add-rule-quick');
    if (addRuleQuickBtn) {
      addRuleQuickBtn.addEventListener('click', () => {
        const currentDomain = this.extractDomain(this.currentTabUrl);
        this.openAddRuleModal(currentDomain || '');
      });
    }

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

    // Show active rules matching current site
    this.renderActiveRules();
    
    // Show all rules
    this.renderAllRules();

    // Update extension toggle button appearance based on state (header)
    const toggleBtnHeader = document.getElementById('toggle-extension-header');
    const toggleIconHeader = document.getElementById('toggle-icon-header');

    if (this.isExtensionEnabled) {
      // Extension is enabled - show pause option
      if (typeof getIcon !== 'undefined') {
        toggleIconHeader.innerHTML = getIcon('pause', 18);
      }
      toggleBtnHeader.classList.remove('disabled');
      toggleBtnHeader.title = 'Pause';
    } else {
      // Extension is disabled - show resume option
      if (typeof getIcon !== 'undefined') {
        toggleIconHeader.innerHTML = getIcon('play', 18);
      }
      toggleBtnHeader.classList.add('disabled');
      toggleBtnHeader.title = 'Resume';
    }
  }

  /**
   * Renders active rules that match the current site
   */
  renderActiveRules() {
    const activeRulesList = document.getElementById('active-rules-list');
    if (!activeRulesList) return;

    const currentDomain = this.extractDomain(this.currentTabUrl);
    if (!currentDomain) {
      activeRulesList.innerHTML = '<p class="empty-text">Unable to detect current site</p>';
      return;
    }

    // Find matching domain rules
    const enabledRules = this.rules.filter(r => r.enabled !== false);
    const matchingRules = enabledRules.filter(rule => {
      if (rule.type === 'domain') {
        const ruleDomain = rule.value.replace(/^www\./, '');
        return currentDomain === ruleDomain || currentDomain.endsWith('.' + ruleDomain);
      }
      return false;
    });

    if (matchingRules.length === 0) {
      activeRulesList.innerHTML = '<p class="empty-text">No matching rules for this site</p>';
      return;
    }

    // Sort by priority (lower = higher priority)
    matchingRules.sort((a, b) => {
      const priorityA = a.priority !== undefined ? parseFloat(a.priority) : 2.0;
      const priorityB = b.priority !== undefined ? parseFloat(b.priority) : 2.0;
      return priorityA - priorityB;
    });

    activeRulesList.innerHTML = matchingRules.map((rule, idx) => {
      const iconHTML = typeof getIcon !== 'undefined' ? getIcon('globe', 16) : '';
      const ruleIndex = this.rules.findIndex(r => r === rule);
      return `
        <div class="rule-preview" data-rule-index="${ruleIndex}" style="cursor: pointer;">
          <span class="rule-icon">${iconHTML}</span>
          <span class="rule-value" title="${rule.value}">${rule.value.length > 30 ? rule.value.substring(0, 30) + '...' : rule.value}</span>
          <span class="rule-folder" title="${rule.folder}">${rule.folder.length > 20 ? rule.folder.substring(0, 20) + '...' : rule.folder}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers to rule previews
    activeRulesList.querySelectorAll('.rule-preview[data-rule-index]').forEach(preview => {
      preview.addEventListener('click', () => {
        const index = parseInt(preview.dataset.ruleIndex);
        if (!isNaN(index) && index >= 0 && index < this.rules.length) {
          this.openEditRuleModal(index);
        }
      });
    });
  }

  /**
   * Renders all rules
   */
  renderAllRules() {
    const allRulesList = document.getElementById('all-rules-list');
    const allRulesSection = document.getElementById('all-rules-preview');
    const activeRulesSection = document.getElementById('rules-preview');
    const addRuleQuickBtn = document.getElementById('add-rule-quick');
    const activeRulesList = document.getElementById('active-rules-list');
    if (!allRulesList) return;

    const enabledRules = this.rules.filter(r => r.enabled !== false);
    const currentDomain = this.extractDomain(this.currentTabUrl);

    if (enabledRules.length === 0) {
      // No rules - keep active rules section visible to show the button
      if (activeRulesSection) {
        activeRulesSection.style.display = 'block';
      }
      if (activeRulesList) {
        activeRulesList.innerHTML = '<p class="empty-text">No matching rules for this site</p>';
      }
      if (allRulesSection && allRulesSection.querySelector('h3')) {
        allRulesSection.querySelector('h3').textContent = 'Rules';
      }
      allRulesList.innerHTML = '<p class="empty-text">No rules configured</p>';

      // Update + Add button to show current site
      if (addRuleQuickBtn && currentDomain) {
        addRuleQuickBtn.textContent = `+ Add ${currentDomain}`;
      }
      return;
    }

    // Has rules - show both sections normally
    if (activeRulesSection) {
      activeRulesSection.style.display = 'block';
    }
    if (allRulesSection && allRulesSection.querySelector('h3')) {
      allRulesSection.querySelector('h3').textContent = 'All Rules';
    }

    // Sort by priority then by type
    enabledRules.sort((a, b) => {
      const priorityA = a.priority !== undefined ? parseFloat(a.priority) : 2.0;
      const priorityB = b.priority !== undefined ? parseFloat(b.priority) : 2.0;
      if (priorityA !== priorityB) return priorityA - priorityB;
      // If same priority, domain rules first
      if (a.type === 'domain' && b.type !== 'domain') return -1;
      if (a.type !== 'domain' && b.type === 'domain') return 1;
      return 0;
    });

    allRulesList.innerHTML = enabledRules.slice(0, 5).map(rule => {
      const iconName = rule.type === 'domain' ? 'globe' : 'search';
      const iconHTML = typeof getIcon !== 'undefined' ? getIcon(iconName, 16) : '';
      const ruleIndex = this.rules.findIndex(r => r === rule);
      return `
        <div class="rule-preview" data-rule-index="${ruleIndex}" style="cursor: pointer;">
          <span class="rule-icon">${iconHTML}</span>
          <span class="rule-value" title="${rule.value}">${rule.value.length > 25 ? rule.value.substring(0, 25) + '...' : rule.value}</span>
          <span class="rule-folder" title="${rule.folder}">${rule.folder.length > 18 ? rule.folder.substring(0, 18) + '...' : rule.folder}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers to rule previews
    allRulesList.querySelectorAll('.rule-preview[data-rule-index]').forEach(preview => {
      preview.addEventListener('click', () => {
        const index = parseInt(preview.dataset.ruleIndex);
        if (!isNaN(index) && index >= 0 && index < this.rules.length) {
          this.openEditRuleModal(index);
        }
      });
    });

    if (enabledRules.length > 5) {
      allRulesList.innerHTML += `<p class="more-rules">+${enabledRules.length - 5} more</p>`;
    }
  }

  /**
   * Updates the "+ Add" button text to show the current site domain
   */
  updateAddRuleButton() {
    const addRuleQuickBtn = document.getElementById('add-rule-quick');
    if (!addRuleQuickBtn) return;

    const currentDomain = this.extractDomain(this.currentTabUrl);

    if (currentDomain) {
      addRuleQuickBtn.textContent = `+ Add ${currentDomain}`;
      addRuleQuickBtn.title = `Add rule for ${currentDomain}`;
    } else {
      addRuleQuickBtn.textContent = '+ Add Rule';
      addRuleQuickBtn.title = 'Add a new rule';
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
    const recentActivitySection = document.getElementById('recent-activity');
    const activities = this.stats.recentActivity || [];

    // Show empty state if no activities
    if (activities.length === 0) {
      // Hide entire "Recent Downloads" section when empty
      if (recentActivitySection) {
        recentActivitySection.style.display = 'none';
      }
      return;
    }

    // Show section and populate activities
    if (recentActivitySection) {
      recentActivitySection.style.display = 'block';
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
    // getFileIcon: Returns Lucide icon markup based on file extension
    const icon = this.getFileIcon(activity.filename);
    // Use the folder property stored in activity (already formatted correctly)
    // folder is set by updateDownloadStats to the actual destination folder
    let displayPath = activity.folder || 'Downloads';
    
    // Format path for display based on whether it's absolute or relative
    displayPath = this.formatActivityPath(displayPath);
    
    // Show routing badge if file was routed by a rule
    const routedBadge = activity.routed && typeof getIcon !== 'undefined' 
      ? `<span class="routed-badge">${getIcon('folder', 14)}</span>` 
      : '';
    
    // Generate HTML template string with activity data
    // Use data attribute instead of inline onclick for CSP compliance
    // Use filePath if available, otherwise fall back to folder (for backward compat)
    const clickPath = activity.filePath || activity.folder || '';
    const filePath = clickPath ? clickPath.replace(/"/g, '&quot;') : '';
    const downloadId = activity.downloadId || '';
    
    return `
      <div class="activity-item ${activity.routed ? 'routed' : ''}" style="cursor: pointer;" ${filePath ? `data-file-path="${filePath}"` : ''} ${downloadId ? `data-download-id="${downloadId}"` : ''}>
        <div class="activity-icon">${icon}</div>
        <div class="activity-info">
          <div class="activity-filename" title="${activity.filename}">${activity.filename} ${routedBadge}</div>
          <div class="activity-path" title="${activity.folder}">${displayPath}</div>
        </div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    `;
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
   * Formats folder path for display in activity items.
   * Shows relative paths as-is, absolute paths condensed with drive and last folders.
   * 
   * Inputs:
   *   - path: String folder path (relative or absolute)
   * 
   * Outputs: String formatted for display (e.g., "scope-test" or "T:/../github > repo")
   */
  formatActivityPath(path) {
    if (!path) return 'Downloads';
    
    // Check if it's an absolute path (Windows or Unix)
    const isAbsolute = /^([A-Za-z]:[\\/]|\/(?!\/))/.test(path);
    
    if (!isAbsolute) {
      // Relative path - just show as-is (e.g., "scope-test", "Images/Screenshots")
      return path.replace(/\\/g, '/');
    }
    
    // Absolute path - condense for display
    // Normalize to forward slashes
    const normalizedPath = path.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(p => p);
    
    if (parts.length === 0) return 'Downloads';
    
    // Get drive letter if present (e.g., "T:")
    let drive = '';
    let folderParts = parts;
    if (/^[A-Za-z]:$/.test(parts[0])) {
      drive = parts[0];
      folderParts = parts.slice(1);
    }
    
    // Show last 2 folder levels with separator
    if (folderParts.length <= 2) {
      // Short path - show all folders
      const displayFolders = folderParts.join(' > ');
      return drive ? `${drive}/${displayFolders}` : displayFolders;
    } else {
      // Long path - show drive/../lastTwo > lastOne
      const lastTwo = folderParts.slice(-2).join(' > ');
      return drive ? `${drive}/../${lastTwo}` : `../${lastTwo}`;
    }
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
   * Returns Lucide icon markup based on file extension extracted from filename.
   * Maps common file types to appropriate visual icons.
   * 
   * Inputs:
   *   - filename: String filename (may include extension)
   * 
   * Outputs: String HTML with Lucide icon markup
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
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'bmp': 'image', 'svg': 'image', 'webp': 'image',
      // Videos
      'mp4': 'video', 'mov': 'video', 'avi': 'video', 'mkv': 'video', 'wmv': 'video', 'flv': 'video', 'webm': 'video',
      // Audio
      'mp3': 'music', 'wav': 'music', 'flac': 'music', 'aac': 'music', 'm4a': 'music',
      // Documents
      'pdf': 'file-text', 'doc': 'file-text', 'docx': 'file-text', 'txt': 'file-text', 'rtf': 'file-text', 'odt': 'file-text',
      // Archives
      'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 'gz': 'archive',
      // Code
      'js': 'file-code', 'html': 'file-code', 'css': 'file-code', 'py': 'file-code', 'cpp': 'file-code', 'java': 'file-code',
      // 3D Files
      'stl': 'box', 'obj': 'box', '3mf': 'box', 'step': 'box', 'stp': 'box', 'ply': 'box',
      // Software
      'exe': 'package', 'msi': 'package', 'dmg': 'package', 'deb': 'package', 'rpm': 'package', 'pkg': 'package'
    };
    
    const iconName = iconMap[extension] || 'file';
    if (typeof getIcon !== 'undefined') {
      return getIcon(iconName, 16);
    }
    return '';
  }

  /**
   * Helper method to check companion app status with retry logic.
   */
  async checkCompanionAppStatusHelper() {
    let status = { installed: false };
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        status = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({ installed: false, error: 'Timeout waiting for response' });
          }, 6000);
          
          chrome.runtime.sendMessage({ type: 'checkCompanionApp' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message || '';
              if (errorMsg.includes('message port closed') || errorMsg.includes('Receiving end does not exist')) {
                resolve({ installed: false, error: 'Service worker not ready', retry: true });
              } else {
                resolve({ installed: false, error: errorMsg });
              }
            } else {
              resolve(response || { installed: false });
            }
          });
        });
        
        if (!status.error || !status.retry) {
          break;
        }
        
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
      } catch (error) {
        console.error(`Companion app check attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries - 1) {
          status = { installed: false, error: error.message };
        }
      }
    }
    
    return status;
  }

  /**
   * Opens folder picker - uses native OS dialog if companion app available.
   */
  async openFolderPicker(callback) {
    if (this.folderPickerOpen) {
      console.log('Folder picker already open, ignoring');
      return;
    }
    
    this.folderPickerOpen = true;
    this.folderSelectCallback = callback;
    
    try {
      const companionStatus = await this.checkCompanionAppStatusHelper();
      
      if (companionStatus && companionStatus.installed) {
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'pickFolderNative',
              startPath: null
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error calling native folder picker:', chrome.runtime.lastError.message);
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false, error: 'No response' });
              }
            });
          });
          
          if (response && response.success) {
            if (response.path) {
              console.log('Folder selected:', response.path);
              if (callback) {
                callback(response.path);
              }
              return;
            } else {
              console.log('User cancelled folder selection');
              if (callback) callback(null);
              return;
            }
          } else if (response && response.error) {
            if (response.error.includes('cancelled') || response.error.includes('CANCELLED')) {
              console.log('User cancelled folder selection (error)');
              if (callback) callback(null);
              return;
            } else {
              console.error('Native folder picker error:', response.error);
              if (callback) callback(null);
              return;
            }
          } else {
            console.error('Unexpected native folder picker response:', response);
            if (callback) callback(null);
            return;
          }
        } catch (error) {
          console.error('Native picker failed:', error.message);
          if (callback) callback(null);
          return;
        }
      } else {
        console.log('Companion app not available for folder picking');
        if (callback) callback(null);
        return;
      }
    } catch (error) {
      console.log('Companion app check failed:', error);
      if (callback) callback(null);
    } finally {
      this.folderPickerOpen = false;
    }
  }

  /**
   * Sets up modal event listeners
   */
  setupModalListeners() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    let isSelecting = false;

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        isSelecting = false;
      }
    });

    overlay.addEventListener('mousemove', (e) => {
      if (e.buttons === 1 && e.target !== overlay) {
        isSelecting = true;
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !isSelecting) {
        this.closeModal();
      }
      isSelecting = false;
    });
  }

  /**
   * Closes the modal and cleans up state
   */
  closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
      modal.classList.remove('active');
    }
    
    if (this.newlyAddedRuleIndex !== null && this.editingRuleIndex === this.newlyAddedRuleIndex) {
      this.rules.splice(this.newlyAddedRuleIndex, 1);
      this.updateDisplay();
      this.newlyAddedRuleIndex = null;
    }
    
    if (this.newlyAddedGroupName !== null && this.editingGroupName === this.newlyAddedGroupName) {
      delete this.groups[this.newlyAddedGroupName];
      this.updateDisplay();
      this.newlyAddedGroupName = null;
    }
    
    this.folderSelectCallback = null;
    this.editingRuleIndex = null;
    this.editingGroupName = null;
  }

  /**
   * Opens edit modal for a rule
   */
  openEditRuleModal(index) {
    const rule = this.rules[index];
    if (!rule) return;
    
    this.editingRuleIndex = index;
    
    const modal = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('folder-picker-modal');
    
    if (!modal || !modalBody) return;
    
    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit Rule</h3>
        <button class="modal-close" id="close-modal">
          ${typeof getIcon !== 'undefined' ? getIcon('x', 16) : '×'}
        </button>
      </div>
      <div class="modal-body edit-form">
        <div class="form-group">
          <label class="form-label">Rule Type</label>
          <select class="form-select" id="edit-rule-type">
            <option value="domain" ${rule.type === 'domain' ? 'selected' : ''}>Site</option>
            <option value="contains" ${rule.type === 'contains' ? 'selected' : ''}>Contains</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${rule.type === 'domain' ? 'Site' : 'Filename contains phrase'}</label>
          <input type="text" class="form-input" id="edit-rule-value" value="${rule.value || ''}" placeholder="${rule.type === 'domain' ? 'e.g., github.com' : 'e.g., invoice, receipt, report'}">
        </div>
        <div class="form-group">
          <label class="form-label">Destination Folder</label>
          <div class="folder-display-clickable" id="edit-rule-folder-display" style="cursor: pointer; padding: 12px 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-elevated); display: flex; align-items: center; gap: 8px;">
            ${typeof getIcon !== 'undefined' ? getIcon('folder', 16) : '📁'}
            <span id="edit-rule-folder-text" style="flex: 1; color: var(--text-primary);">${rule.folder || 'Downloads'}</span>
            <span style="color: var(--text-secondary); font-size: 12px;">Click to browse</span>
          </div>
          <input type="hidden" id="edit-rule-folder" value="${rule.folder || 'Downloads'}">
        </div>
        
        <div class="advanced-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-subtle);">
          <button type="button" class="advanced-toggle" id="edit-rule-advanced-toggle" style="background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 500; margin-bottom: 16px;">
            <span id="edit-rule-advanced-icon" style="display: inline-flex; align-items: center; transition: transform 0.2s;">${typeof getIcon !== 'undefined' ? getIcon('chevron-down', 16) : '▼'}</span>
            <span>Advanced</span>
          </button>
          <div class="advanced-content" id="edit-rule-advanced-content" style="display: none; padding-left: 20px;">
            <div class="form-group">
              <label class="form-label">
                Priority
                <span class="help-text">1 = highest priority. Use decimals for fine control (e.g., 1.5, 2.7)</span>
              </label>
              <input type="number" class="form-input" id="edit-rule-priority" 
                     value="${rule.priority !== undefined ? parseFloat(rule.priority).toFixed(1) : '2.0'}"
                     min="0.1" max="10" step="0.1" placeholder="2.0">
              <div class="priority-hint">Default: 2.0 | Common: 1.0 (highest), 2.0 (medium), 3.0 (file types)</div>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="toggle-label">
                <input type="checkbox" id="edit-rule-enabled" ${rule.enabled !== false ? 'checked' : ''}>
                <span>Enabled</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="modal-cancel">Cancel</button>
        <button class="btn primary" id="modal-save">Save Changes</button>
      </div>
    `;
    
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    
    const folderDisplay = document.getElementById('edit-rule-folder-display');
    const folderText = document.getElementById('edit-rule-folder-text');
    const folderInput = document.getElementById('edit-rule-folder');
    
    if (folderDisplay) {
      folderDisplay.addEventListener('click', () => {
        this.openFolderPicker((folder) => {
          if (folder && folderInput && folderText) {
            // Normalize folder path (remove trailing slashes for consistency)
            const normalizedFolder = folder.replace(/[\/\\]+$/, '');
            folderInput.value = normalizedFolder;
            folderText.textContent = normalizedFolder;
            console.log('[POPUP EDIT RULE] Folder updated to:', normalizedFolder);
          }
        });
      });
    }
    
    const editRuleType = document.getElementById('edit-rule-type');
    const editRuleValue = document.getElementById('edit-rule-value');
    const editRuleLabel = editRuleValue?.closest('.form-group')?.querySelector('.form-label');
    
    if (editRuleType && editRuleValue) {
      editRuleType.addEventListener('change', (e) => {
        const isDomain = e.target.value === 'domain';
        if (editRuleLabel) {
          editRuleLabel.textContent = isDomain ? 'Site' : 'Contains phrase';
        }
        editRuleValue.placeholder = isDomain ? 'e.g., github.com' : 'e.g., invoice, receipt, report';
      });
    }
    
    const advancedToggle = document.getElementById('edit-rule-advanced-toggle');
    const advancedContent = document.getElementById('edit-rule-advanced-content');
    const advancedIcon = document.getElementById('edit-rule-advanced-icon');
    
    if (advancedToggle && advancedContent) {
      advancedToggle.addEventListener('click', () => {
        const isVisible = advancedContent.style.display !== 'none';
        advancedContent.style.display = isVisible ? 'none' : 'block';
        advancedIcon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
    }
    
    document.getElementById('modal-save').addEventListener('click', () => this.saveEditedRule());
    
    modal.classList.add('active');
  }

  /**
   * Opens edit modal for a file type group
   */
  openEditGroupModal(name) {
    const group = this.groups[name];
    if (!group) return;
    
    this.editingGroupName = name;
    
    const modal = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('folder-picker-modal');
    
    if (!modal || !modalBody) return;
    
    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit File Type</h3>
        <button class="modal-close" id="close-modal">
          ${typeof getIcon !== 'undefined' ? getIcon('x', 16) : '×'}
        </button>
      </div>
      <div class="modal-body edit-form">
        <div class="form-group">
          <label class="form-label">File Type Name</label>
          <input type="text" class="form-input" id="edit-group-name" value="${name}" placeholder="e.g., 3d-files">
        </div>
        <div class="form-group">
          <label class="form-label">Extensions (comma-separated)</label>
          <input type="text" class="form-input" id="edit-group-extensions" value="${group.extensions || ''}" placeholder="e.g., stl,obj,3mf">
        </div>
        <div class="form-group">
          <label class="form-label">Destination Folder</label>
          <div class="folder-display-clickable" id="edit-group-folder-display" style="cursor: pointer; padding: 12px 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-elevated); display: flex; align-items: center; gap: 8px;">
            ${typeof getIcon !== 'undefined' ? getIcon('folder', 16) : '📁'}
            <span id="edit-group-folder-text" style="flex: 1; color: var(--text-primary);">${group.folder || 'Downloads'}</span>
            <span style="color: var(--text-secondary); font-size: 12px;">Click to browse</span>
          </div>
          <input type="hidden" id="edit-group-folder" value="${group.folder || 'Downloads'}">
        </div>
        
        <div class="advanced-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-subtle);">
          <button type="button" class="advanced-toggle" id="edit-group-advanced-toggle" style="background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 500; margin-bottom: 16px;">
            <span id="edit-group-advanced-icon" style="display: inline-flex; align-items: center; transition: transform 0.2s;">${typeof getIcon !== 'undefined' ? getIcon('chevron-down', 16) : '▼'}</span>
            <span>Advanced</span>
          </button>
          <div class="advanced-content" id="edit-group-advanced-content" style="display: none; padding-left: 20px;">
            <div class="form-group">
              <label class="form-label">
                Priority
                <span class="help-text">1 = highest priority. Use decimals for fine control (e.g., 2.5, 3.2)</span>
              </label>
              <input type="number" class="form-input" id="edit-group-priority" 
                     value="${group.priority !== undefined ? parseFloat(group.priority).toFixed(1) : '3.0'}"
                     min="0.1" max="10" step="0.1" placeholder="3.0">
              <div class="priority-hint">Default: 3.0 | File types typically use 2.5-4.0 range</div>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="toggle-label">
                <input type="checkbox" id="edit-group-override" ${group.overrideDomainRules ? 'checked' : ''}>
                <span>Override Site Rules</span>
              </label>
              <div class="help-text">Forces file type match even if a domain rule exists</div>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="toggle-label">
                <input type="checkbox" id="edit-group-enabled" ${group.enabled !== false ? 'checked' : ''}>
                <span>Enabled</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn secondary" id="modal-cancel">Cancel</button>
        <button class="btn primary" id="modal-save">Save Changes</button>
      </div>
    `;
    
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    
    const folderDisplay = document.getElementById('edit-group-folder-display');
    const folderText = document.getElementById('edit-group-folder-text');
    const folderInput = document.getElementById('edit-group-folder');
    
    if (folderDisplay) {
      folderDisplay.addEventListener('click', () => {
        this.openFolderPicker((folder) => {
          if (folder && folderInput && folderText) {
            // Normalize folder path (remove trailing slashes for consistency)
            const normalizedFolder = folder.replace(/[\/\\]+$/, '');
            folderInput.value = normalizedFolder;
            folderText.textContent = normalizedFolder;
            console.log('[POPUP EDIT GROUP] Folder updated to:', normalizedFolder);
          }
        });
      });
    }
    
    const advancedToggle = document.getElementById('edit-group-advanced-toggle');
    const advancedContent = document.getElementById('edit-group-advanced-content');
    const advancedIcon = document.getElementById('edit-group-advanced-icon');
    
    if (advancedToggle && advancedContent) {
      advancedToggle.addEventListener('click', () => {
        const isVisible = advancedContent.style.display !== 'none';
        advancedContent.style.display = isVisible ? 'none' : 'block';
        if (advancedIcon) {
          advancedIcon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
      });
    }
    
    document.getElementById('modal-save').addEventListener('click', () => this.saveEditedGroup());
    
    modal.classList.add('active');
  }

  /**
   * Opens add rule modal with optional domain prefilled
   */
  openAddRuleModal(domain = '') {
    this.rules.push({
      type: 'domain',
      value: domain,
      folder: 'Downloads',
      priority: 2.0,
      enabled: true
    });
    this.newlyAddedRuleIndex = this.rules.length - 1;
    this.openEditRuleModal(this.rules.length - 1);
  }

  /**
   * Saves the currently edited rule
   */
  async saveEditedRule() {
    if (this.editingRuleIndex === null) return;
    
    const type = document.getElementById('edit-rule-type').value;
    const value = document.getElementById('edit-rule-value').value.trim();
    const folderInput = document.getElementById('edit-rule-folder');
    const folder = folderInput ? folderInput.value.trim() : 'Downloads';
    const priorityInput = document.getElementById('edit-rule-priority').value;
    const priority = Math.max(0.1, Math.min(10, Math.round(parseFloat(priorityInput) * 10) / 10)) || 2.0;
    const enabled = document.getElementById('edit-rule-enabled').checked;
    
    console.log('[POPUP SAVE RULE] Saving rule with folder:', folder);
    console.log('[POPUP SAVE RULE] Folder input value:', folderInput?.value);
    
    this.rules[this.editingRuleIndex] = {
      type,
      value,
      folder,
      priority,
      enabled
    };
    
    console.log('[POPUP SAVE RULE] Rule to save:', this.rules[this.editingRuleIndex]);
    
    if (this.newlyAddedRuleIndex === this.editingRuleIndex) {
      this.newlyAddedRuleIndex = null;
    }
    
    await this.saveRules();
    this.updateDisplay();
    this.closeModal();
    this.showToast('Rule saved');
  }

  /**
   * Saves the currently edited group
   */
  async saveEditedGroup() {
    if (!this.editingGroupName) return;
    
    const newName = document.getElementById('edit-group-name').value.trim();
    const extensions = document.getElementById('edit-group-extensions').value.trim();
    const folderInput = document.getElementById('edit-group-folder');
    const folder = folderInput ? folderInput.value.trim() : 'Downloads';
    const priorityInput = document.getElementById('edit-group-priority').value;
    const priority = Math.max(0.1, Math.min(10, Math.round(parseFloat(priorityInput) * 10) / 10)) || 3.0;
    const overrideDomainRules = document.getElementById('edit-group-override').checked;
    const enabled = document.getElementById('edit-group-enabled').checked;
    
    console.log('[POPUP SAVE GROUP] Saving group with folder:', folder);
    console.log('[POPUP SAVE GROUP] Folder input value:', folderInput?.value);
    
    if (newName && newName !== this.editingGroupName) {
      delete this.groups[this.editingGroupName];
      if (this.newlyAddedGroupName === this.editingGroupName) {
        this.newlyAddedGroupName = newName;
      }
    }
    
    const saveName = newName || this.editingGroupName;
    this.groups[saveName] = {
      extensions,
      folder,
      priority,
      overrideDomainRules,
      enabled
    };
    
    if (this.newlyAddedGroupName === saveName) {
      this.newlyAddedGroupName = null;
    }
    
    await this.saveRules();
    this.updateDisplay();
    this.closeModal();
    this.showToast('File type saved');
  }

  /**
   * Saves rules and groups to storage
   */
  async saveRules() {
    await chrome.storage.sync.set({
      rules: this.rules,
      groups: this.groups
    });
    
    // Notify all tabs that rules have been updated
    // This will trigger the background script's storage.onChanged listener
    // which will then notify content scripts to update their overlays
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'rulesChanged'
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      });
    });
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
 * Helper function to format path display in breadcrumb format.
 * Converts relative paths like "3DPrinting/file.stl" to "Downloads > 3DPrinting"
 * 
 * Inputs:
 *   - relativePath: String relative path
 * 
 * Outputs: String formatted breadcrumb path
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
 * Initialize popup app when DOM content is fully loaded.
 * Creates PopupApp instance to manage popup interface.
 */
// document.addEventListener: Listens for DOMContentLoaded event
//   Inputs: Event type ('DOMContentLoaded'), callback function
//   Outputs: None (sets up listener)
document.addEventListener('DOMContentLoaded', () => {
  // Initialize icons
  if (typeof getIcon !== 'undefined') {
    // Set app icon
    const appIcon = document.getElementById('app-icon');
    if (appIcon) appIcon.innerHTML = getIcon('folder', 32);
    
    // Set settings icon (header)
    const settingsIconHeader = document.getElementById('settings-icon-header');
    if (settingsIconHeader) settingsIconHeader.innerHTML = getIcon('settings', 18);
    
    // Set toggle icon (header) - will be updated by updateDisplay()
    const toggleIconHeader = document.getElementById('toggle-icon-header');
    if (toggleIconHeader) toggleIconHeader.innerHTML = getIcon('pause', 18);
    
    // Set welcome icon
    const welcomeIcon = document.getElementById('welcome-icon');
    if (welcomeIcon) welcomeIcon.innerHTML = getIcon('folder', 64);
    
    // Set clear icon
    const clearIcon = document.getElementById('clear-icon');
    if (clearIcon) clearIcon.innerHTML = getIcon('x', 16) || getIcon('trash', 16) || '×';
    
    // Set check icons in welcome tips
    document.querySelectorAll('.check-icon').forEach(icon => {
      icon.innerHTML = getIcon('check', 18);
    });
  }
  
  // Check for welcome experience
  const hasSeenWelcome = localStorage.getItem('downloadRouterHasSeenWelcome');
  const popupApp = new PopupApp();
  
  if (!hasSeenWelcome) {
    // Show welcome overlay
    const welcomeOverlay = document.getElementById('welcome-overlay');
    if (welcomeOverlay) {
      welcomeOverlay.classList.add('active');
      
      // Dismiss welcome overlay
      document.getElementById('welcome-dismiss').addEventListener('click', () => {
        welcomeOverlay.classList.remove('active');
        localStorage.setItem('downloadRouterHasSeenWelcome', 'true');
      });
    }
  }
});
