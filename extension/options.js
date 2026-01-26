/**
 * options.js aka settings page
 * 
 * Purpose: Options page for the Download Router Chrome extension.
 * Role: Provides comprehensive interface for managing routing rules, file type groups,
 *       settings configuration, and folder browser. Serves as the main configuration center.
 * 
 * Key Responsibilities:
 * - Manage routing rules (domain and extension-based)
 * - Configure file type groups with folders
 * - Adjust extension settings (confirmation, timeouts, tie-breakers)
 * - Browse and manage download folders
 * - Save and reset configuration options
 * 
 * Architecture:
 * - Tabbed interface with separate sections for rules, groups, settings, and folders
 * - Modal folder picker for visual folder selection
 * - Real-time validation and conflict detection
 * - Persistent storage synchronization across Chrome instances
 */

/**
 * OptionsApp class
 * Manages the options page interface and configuration management.
 * Handles all user interactions for configuring the extension.
 */
class OptionsApp {
  /**
   * Initializes the OptionsApp instance.
   * Sets default state and begins initialization process.
   * 
   * Inputs: None
   * Outputs: None (calls init method)
   */
  constructor() {
    // Current active tab name ('rules', 'filetypes', 'settings')
    this.currentTab = 'rules';
    // Array of routing rules
    this.rules = [];
    // Object mapping group names to group configurations
    this.groups = {};
    // Object containing extension settings
    this.settings = {};
    // Pending domain to prefill when adding a rule
    this.pendingDomain = null;
    // Track newly added items that haven't been saved yet
    this.newlyAddedRuleIndex = null;
    this.newlyAddedGroupName = null;
    this.init();
  }

  /**
   * Initializes options page by loading data and setting up UI.
   * Loads configuration, sets up event handlers, and renders initial view.
   * 
   * Inputs: None
   * Outputs: None (updates UI and sets up listeners)
   * 
   * External Dependencies:
   *   - loadData: Method in this class to retrieve data from storage
   *   - setupEventListeners: Method in this class to attach event handlers
   *   - setupTabNavigation: Method in this class to configure tab switching
   *   - renderCurrentTab: Method in this class to render active tab content
   *   - loadFolders: Method in this class to populate folder list
   */
  async init() {
    // Check for pending domain and auto-open flag from popup
    const storageData = await chrome.storage.local.get(['pendingRuleDomain', 'autoOpenAddRule']);
    if (storageData.pendingRuleDomain) {
      this.pendingDomain = storageData.pendingRuleDomain;
      // Clear it from storage immediately to prevent reuse
      await chrome.storage.local.remove(['pendingRuleDomain']);
    }
    
    // Load configuration data from Chrome storage
    await this.loadData();
    // Attach event handlers to UI elements
    this.setupEventListeners();
    // Configure tab navigation system
    this.setupTabNavigation();
    // Render the currently active tab
    this.renderCurrentTab();
    // Check companion app status and update UI
    this.checkCompanionAppStatus();
    
    // Auto-open add rule modal if flagged from popup
    // Use setTimeout to ensure DOM is fully ready
    if (storageData.autoOpenAddRule) {
      // Clear flag immediately to prevent reuse
      await chrome.storage.local.remove(['autoOpenAddRule']);
      // Switch to rules tab if not already there
      if (this.currentTab !== 'rules') {
        this.switchTab('rules');
      }
      // Wait for UI to settle, then open add rule modal
      setTimeout(() => {
        // Double-check flag wasn't cleared
        this.addRule();
      }, 200);
    }
  }

  /**
   * Helper method to check companion app status with retry logic.
   * Used by multiple methods that need to verify companion app availability.
   * 
   * Inputs: None
   * 
   * Outputs: Promise resolving to status object
   */
  async checkCompanionAppStatusHelper() {
    // Retry logic: service worker may need time to wake up
    let status = { installed: false };
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        status = await new Promise((resolve, reject) => {
          // Set timeout for the message
          const timeout = setTimeout(() => {
            resolve({ installed: false, error: 'Timeout waiting for response' });
          }, 6000); // 6 second timeout
          
          chrome.runtime.sendMessage({ type: 'checkCompanionApp' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              // Check if it's a service worker not awake error
              const errorMsg = chrome.runtime.lastError.message || '';
              if (errorMsg.includes('message port closed') || errorMsg.includes('Receiving end does not exist')) {
                // Service worker not awake, will retry
                resolve({ installed: false, error: 'Service worker not ready', retry: true });
              } else {
                resolve({ installed: false, error: errorMsg });
              }
            } else {
              // Got a valid response
              resolve(response || { installed: false });
            }
          });
        });
        
        // If we got a valid response (not a retry), break out of loop
        if (!status.error || !status.retry) {
          break;
        }
        
        // Wait before retrying (exponential backoff)
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
   * Checks companion app installation status and updates UI indicators.
   * Retries if service worker is not awake.
   * 
   * Inputs: None
   * 
   * Outputs: None (updates UI elements)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for communicating with background script
   */
  /**
   * Converts a clickable folder display to a text input with autocomplete for non-companion app users.
   * For companion app users, keeps the clickable display.
   */
  async setupFolderInput(displayElement, hiddenInput, textSpan, onFolderChange = null) {
    if (!displayElement || !hiddenInput) return;
    
    const companionStatus = await this.checkCompanionAppStatusHelper();
    
    if (companionStatus && companionStatus.installed) {
      // Companion app available - keep clickable display
      displayElement.addEventListener('click', () => {
        this.openFolderPicker((folder) => {
          if (folder && hiddenInput && textSpan) {
            const normalizedFolder = folder.replace(/[\/\\]+$/, '');
            hiddenInput.value = normalizedFolder;
            if (textSpan) textSpan.textContent = normalizedFolder;
            if (onFolderChange) onFolderChange(normalizedFolder);
          }
        });
      });
    } else {
      // No companion app - convert to text input with autocomplete
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'form-input';
      textInput.value = hiddenInput.value || 'Downloads';
      textInput.style.cssText = 'width: 100%; padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: 4px;';
      textInput.placeholder = 'Type folder path (e.g., Documents/Subfolder)';
      
      // Replace display with input
      displayElement.replaceWith(textInput);
      
      // Update hidden input when text input changes
      textInput.addEventListener('input', () => {
        const normalized = textInput.value ? textInput.value.replace(/\\/g, '/') : '';
        hiddenInput.value = normalized;
        if (textSpan) textSpan.textContent = normalized;
        if (onFolderChange) onFolderChange(normalized);
      });
      
      // Attach autocomplete
      this.attachFolderAutocomplete(textInput, (selectedPath) => {
        if (selectedPath) {
          hiddenInput.value = selectedPath;
          if (textSpan) textSpan.textContent = selectedPath;
          if (onFolderChange) onFolderChange(selectedPath);
        }
      });
    }
  }

  /**
   * Attaches autocomplete dropdown to a folder input field for non-companion app users.
   */
  attachFolderAutocomplete(inputElement, callback = null) {
    if (!inputElement) return;
    
    let dropdown = null;
    let selectedIndex = -1;
    let suggestions = [];
    
    // Create dropdown container
    const createDropdown = () => {
      if (dropdown) return;
      
      dropdown = document.createElement('div');
      dropdown.className = 'folder-autocomplete-dropdown';
      dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: var(--surface-elevated, #ffffff);
        border: 1px solid var(--border-subtle, #ddd);
        border-top: none;
        border-radius: 0 0 4px 4px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        display: none;
      `;
      
      const inputParent = inputElement.parentElement;
      if (inputParent) {
        inputParent.style.position = 'relative';
        inputParent.appendChild(dropdown);
      }
    };
    
    const updateDropdown = (filteredSuggestions) => {
      if (!dropdown) createDropdown();
      
      suggestions = filteredSuggestions;
      selectedIndex = -1;
      
      if (filteredSuggestions.length === 0) {
        dropdown.style.display = 'none';
        return;
      }
      
      dropdown.innerHTML = filteredSuggestions.map((path, index) => `
        <div class="autocomplete-item" data-index="${index}" style="
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-subtle, #eee);
          background: ${index === selectedIndex ? 'var(--surface-hover, #f0f0f0)' : 'transparent'};
        ">
          ${path}
        </div>
      `).join('');
      
      dropdown.style.display = 'block';
      
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const path = filteredSuggestions[parseInt(item.dataset.index)];
          inputElement.value = path;
          if (callback) callback(path);
          hideDropdown();
        });
      });
    };
    
    const hideDropdown = () => {
      if (dropdown) {
        dropdown.style.display = 'none';
        selectedIndex = -1;
      }
    };
    
    let allPaths = [];
    chrome.runtime.sendMessage({ type: 'getUsedFolderPaths' }, (response) => {
      if (response && response.success && response.paths) {
        allPaths = response.paths;
      }
    });
    
    let debounceTimer = null;
    inputElement.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const value = e.target.value.trim();
        const normalizedValue = value.replace(/\\/g, '/').toLowerCase();
        
        if (normalizedValue === '') {
          updateDropdown(allPaths);
        } else {
          const filtered = allPaths.filter(path => 
            path.toLowerCase().includes(normalizedValue)
          );
          updateDropdown(filtered);
        }
      }, 150);
    });
    
    inputElement.addEventListener('keydown', (e) => {
      if (!dropdown || dropdown.style.display === 'none') return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        updateDropdown(suggestions);
        const item = dropdown.querySelector(`[data-index="${selectedIndex}"]`);
        if (item) item.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateDropdown(suggestions);
        if (selectedIndex >= 0) {
          const item = dropdown.querySelector(`[data-index="${selectedIndex}"]`);
          if (item) item.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          inputElement.value = suggestions[selectedIndex];
          if (callback) callback(suggestions[selectedIndex]);
          hideDropdown();
        }
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });
    
    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== inputElement) {
        hideDropdown();
      }
    });
    
    inputElement.addEventListener('focus', () => {
      if (allPaths.length > 0) {
        updateDropdown(allPaths);
      }
    });
  }

  async checkCompanionAppStatus() {
    try {
      const status = await this.checkCompanionAppStatusHelper();
      
      // Update default folder UI based on companion app status
      const companionInfo = document.getElementById('default-folder-companion-info');
      const nonCompanionInfo = document.getElementById('default-folder-non-companion-info');
      const chromeDownloadsLink = document.getElementById('chrome-downloads-link');
      const browseBtn = document.getElementById('browse-default-folder');
      const defaultFolderInput = document.getElementById('default-folder');
      const companionTimerNote = document.getElementById('companion-app-timer-note');
      
      if (status && status.installed) {
        if (companionInfo) companionInfo.style.display = 'block';
        if (nonCompanionInfo) nonCompanionInfo.style.display = 'none';
        if (chromeDownloadsLink) chromeDownloadsLink.style.display = 'none';
        if (browseBtn) browseBtn.style.display = 'inline-block';
        if (companionTimerNote) companionTimerNote.style.display = 'block';
      } else {
        if (companionInfo) companionInfo.style.display = 'none';
        if (nonCompanionInfo) nonCompanionInfo.style.display = 'block';
        if (chromeDownloadsLink) chromeDownloadsLink.style.display = 'block';
        if (browseBtn) browseBtn.style.display = 'none';
        if (companionTimerNote) companionTimerNote.style.display = 'none';
        
        // Add autocomplete to default folder input for non-companion app users
        if (defaultFolderInput) {
          this.attachFolderAutocomplete(defaultFolderInput);
        }
      }
      
      // Update UI with companion app status
      // Add status indicator to settings tab or header
      const settingsTab = document.getElementById('settings-tab');
      if (settingsTab && status) {
        let statusElement = document.getElementById('companion-status');
        if (!statusElement) {
          statusElement = document.createElement('div');
          statusElement.id = 'companion-status';
          statusElement.style.cssText = 'padding: 12px; margin: 16px 0; border-radius: 8px; font-size: 13px;';
          settingsTab.insertBefore(statusElement, settingsTab.firstChild);
        }
        
        if (status.installed) {
          statusElement.style.background = '#e8f5e9';
          statusElement.style.color = '#2e7d32';
          statusElement.style.border = '1px solid #4caf50';
          const checkIcon = typeof getIcon !== 'undefined' ? getIcon('check-circle', 18) : '✓';
          statusElement.innerHTML = `
            <strong style="display: inline-flex; align-items: center; gap: 6px;">
              ${checkIcon}
              <span>Companion App Installed</span>
            </strong><br>
            Version ${status.version || 'unknown'} on ${status.platform || 'unknown'}
          `;
        } else {
          statusElement.style.background = '#fff3e0';
          statusElement.style.color = '#e65100';
          statusElement.style.border = '1px solid #ff9800';
          const alertIcon = typeof getIcon !== 'undefined' ? getIcon('alert-triangle', 18) : '⚠';
          statusElement.innerHTML = `
            <strong style="display: inline-flex; align-items: center; gap: 6px;">
              ${alertIcon}
              <span>Companion App Not Installed</span>
            </strong><br>
            Install the companion app for native folder picker and absolute path support.<br>
            <a href="#" id="companion-install-link" style="color: #e65100; text-decoration: underline;">Download & Install</a>
          `;
          
          // Add install link handler
          document.getElementById('companion-install-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/releases' });
          });
        }
      }
    } catch (error) {
      console.error('Failed to check companion app status:', error);
    }
  }

  /**
   * Loads extension configuration data from Chrome sync storage.
   * Retrieves rules, groups, settings, and folder information.
   * 
   * Inputs: None
   * 
   * Outputs: None (updates instance properties)
   * 
   * External Dependencies:
   *   - chrome.storage.sync: Chrome API for retrieving sync storage data
   *   - getDefaultGroups: Method in this class to get default group structure
   *   - getCommonFolders: Method in this class to get default folder list
   */
  async loadData() {
    // chrome.storage.sync.get: Retrieves data from sync storage
    //   Inputs: Array of keys to retrieve
    //   Outputs: Promise resolving to object with stored values
    const data = await chrome.storage.sync.get([
      'rules', 
      'groups', 
      'tieBreaker', 
      'confirmationEnabled', 
      'confirmationTimeout',
      'downloadPath',
      'availableFolders'
    ]);
    
    // Store retrieved data with defaults if not present
    this.rules = data.rules || [];
    // Use default groups if none exist in storage
    this.groups = data.groups || this.getDefaultGroups();
    // Build settings object with defaults
    this.settings = {
      confirmationEnabled: data.confirmationEnabled !== false,
      // Convert timeout from milliseconds to seconds for display
      confirmationTimeout: (data.confirmationTimeout || 5000) / 1000,
      defaultFolder: data.defaultFolder || 'Downloads',
      conflictResolution: data.conflictResolution || 'auto'
    };
  }

  /**
   * Attaches event listeners to all interactive UI elements.
   * Sets up handlers for save, reset, add, settings, and folder operations.
   * 
   * Inputs: None (uses DOM elements from options.html)
   * 
   * Outputs: None (attaches event listeners)
   * 
   * External Dependencies:
   *   - document.getElementById: Browser DOM API to find elements
   *   - addEventListener: Browser DOM API to attach event handlers
   *   - setupSettingsListeners: Method in this class for settings-specific handlers
   *   - setupModalListeners: Method in this class for modal interactions
   */
  setupEventListeners() {
    // Settings are auto-saved, but keep reset button
    // Save options button removed - auto-save on change
    
    // Reset options button - resets all settings to defaults
    document.getElementById('reset-options').addEventListener('click', () => this.resetOptions());
    
    // Add new rule button
    document.getElementById('add-rule').addEventListener('click', () => this.addRule());
    // Add new group button
    document.getElementById('add-group').addEventListener('click', () => this.addGroup());
    // Load default groups button - restores default file type groups
    document.getElementById('load-defaults').addEventListener('click', () => this.loadDefaultGroups());
    
    // Set up settings-specific event listeners
    this.setupSettingsListeners();
    
    // Set up modal interaction listeners
    this.setupModalListeners();
  }

  setupSettingsListeners() {
    const confirmationEnabled = document.getElementById('confirmation-enabled');
    const confirmationTimeout = document.getElementById('confirmation-timeout');
    const timeoutValue = document.getElementById('timeout-value');
    
    confirmationEnabled.addEventListener('change', async (e) => {
      const timeoutSetting = document.getElementById('timeout-setting');
      timeoutSetting.style.opacity = e.target.checked ? '1' : '0.5';
      timeoutSetting.style.pointerEvents = e.target.checked ? 'auto' : 'none';
      // Auto-save settings
      await this.saveSettingsOnly();
    });
    
    confirmationTimeout.addEventListener('input', (e) => {
      timeoutValue.textContent = `${e.target.value}s`;
    });
    
    // Auto-save timeout on blur
    confirmationTimeout.addEventListener('change', async (e) => {
      await this.saveSettingsOnly();
    });
    
    // Initialize
    confirmationEnabled.checked = this.settings.confirmationEnabled;
    confirmationTimeout.value = this.settings.confirmationTimeout;
    timeoutValue.textContent = `${this.settings.confirmationTimeout}s`;
    
    // Default folder setting
    const defaultFolderInput = document.getElementById('default-folder');
    const browseDefaultFolderBtn = document.getElementById('browse-default-folder');
    const openChromeDownloadsBtn = document.getElementById('open-chrome-downloads-settings');
    const openChromeBehaviorBtn = document.getElementById('open-chrome-download-behavior');
    
    if (defaultFolderInput) {
      defaultFolderInput.value = this.settings.defaultFolder || 'Downloads';
      // Auto-save on change
      defaultFolderInput.addEventListener('blur', async () => {
        await this.saveSettingsOnly();
      });
    }
    if (browseDefaultFolderBtn) {
      browseDefaultFolderBtn.addEventListener('click', () => {
        this.openFolderPicker(async (folder) => {
          if (folder && defaultFolderInput) {
            defaultFolderInput.value = folder;
            // Trigger change event to update any listeners
            defaultFolderInput.dispatchEvent(new Event('change', { bubbles: true }));
            // Force UI update
            defaultFolderInput.blur();
            defaultFolderInput.focus();
            await this.saveSettingsOnly();
          }
        });
      });
    }
    if (openChromeDownloadsBtn) {
      openChromeDownloadsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://settings/downloads' });
      });
    }
    if (openChromeBehaviorBtn) {
      openChromeBehaviorBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://settings/downloads' });
      });
    }
    
    // Conflict resolution setting
    const conflictResolution = this.settings.conflictResolution || 'auto';
    const conflictRadio = document.querySelector(`input[name="conflict-resolution"][value="${conflictResolution}"]`);
    if (conflictRadio) {
      conflictRadio.checked = true;
    }
    
    // Auto-save conflict resolution on change
    document.querySelectorAll('input[name="conflict-resolution"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        await this.saveSettingsOnly();
      });
    });
  }
  
  /**
   * Saves only settings (not rules/groups) - used for auto-save
   */
  async saveSettingsOnly() {
    const confirmationEnabled = document.getElementById('confirmation-enabled').checked;
    const confirmationTimeout = parseInt(document.getElementById('confirmation-timeout').value) * 1000;
    const conflictResolution = document.querySelector('input[name="conflict-resolution"]:checked')?.value || 'auto';
    const defaultFolderInput = document.getElementById('default-folder');
    const defaultFolder = defaultFolderInput ? defaultFolderInput.value : 'Downloads';

    await chrome.storage.sync.set({
      confirmationEnabled: confirmationEnabled,
      confirmationTimeout: confirmationTimeout,
      defaultFolder: defaultFolder,
      conflictResolution: conflictResolution
    });

    // Notify all tabs of settings change so overlays can update in real-time
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'settingsChanged',
        confirmationTimeout: confirmationTimeout,
        confirmationEnabled: confirmationEnabled
      }).catch(() => {
        // Ignore errors for tabs without content script
      });
    });

    this.showStatus('Settings saved', 'success');
  }

  setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  switchTab(tab) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tab}-tab`);
    });
    
    this.currentTab = tab;
    this.renderCurrentTab();
  }

  renderCurrentTab() {
    switch(this.currentTab) {
      case 'rules':
        this.renderRules();
        break;
      case 'filetypes':
        this.renderGroups();
        break;
    }
  }

  renderRules() {
    const container = document.getElementById('rules-container');
    const emptyState = document.getElementById('rules-empty');
    
    if (this.rules.length === 0) {
      // Clear container and show empty state
      container.innerHTML = '';
      container.appendChild(emptyState);
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    const rulesHTML = this.rules.map((rule, index) => 
      this.createRuleHTML(rule, index)
    ).join('');
    
    container.innerHTML = rulesHTML + emptyState.outerHTML;
    this.attachRuleListeners();
  }

  createRuleHTML(rule, index) {
    const iconName = rule.type === 'domain' ? 'globe' : 'search';
    const iconHTML = typeof window.getIcon !== 'undefined' ? window.getIcon(iconName, 16) : (typeof getIcon !== 'undefined' ? getIcon(iconName, 16) : '');
    const enabled = rule.enabled !== false;
    const statusClass = enabled ? 'status-enabled' : 'status-disabled';
    
    return `
      <div class="rule-item ${statusClass}" data-index="${index}">
        <div class="item-header">
          <div class="item-type">
            <span class="item-icon">${iconHTML}</span>
            <select class="quick-edit rule-type-quick" data-index="${index}">
              <option value="domain" ${rule.type === 'domain' ? 'selected' : ''}>Site Rule</option>
              <option value="contains" ${rule.type === 'contains' ? 'selected' : ''}>Contains Rule</option>
            </select>
          </div>
          <div class="item-actions">
            <label class="toggle-label quick-toggle">
              <input type="checkbox" class="rule-enabled-quick" data-index="${index}" ${enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
            <button class="btn secondary small edit-rule" data-index="${index}">Edit</button>
            <button class="btn danger small delete-rule" data-index="${index}">Delete</button>
          </div>
        </div>
        <div class="item-content quick-edit-content">
          <div class="form-group quick-edit-group">
            <label class="form-label">${rule.type === 'domain' ? 'Site' : 'Filename contains phrase'}</label>
            <input type="text" class="form-input quick-edit-input rule-value-quick" 
                   value="${rule.value || ''}" 
                   data-index="${index}"
                   placeholder="${rule.type === 'domain' ? 'e.g., github.com' : 'e.g., invoice, receipt, report'}">
          </div>
          <div class="form-group quick-edit-group">
            <label class="form-label">Destination Folder</label>
            <div class="folder-display-clickable" style="cursor: pointer; padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-elevated); display: flex; align-items: center; gap: 8px;" data-index="${index}">
              ${typeof window.getIcon !== 'undefined' ? window.getIcon('folder', 14) : (typeof getIcon !== 'undefined' ? getIcon('folder', 14) : '📁')}
              <span class="rule-folder-quick-text" style="flex: 1; color: var(--text-primary);" data-index="${index}">${rule.folder || 'Downloads'}</span>
              <span style="color: var(--text-secondary); font-size: 11px;">Click to browse</span>
            </div>
            <input type="hidden" class="rule-folder-quick" value="${rule.folder || 'Downloads'}" data-index="${index}">
          </div>
        </div>
      </div>
    `;
  }

  attachRuleListeners() {
    // Delete rule buttons
    document.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        if (!isNaN(index)) {
          this.deleteRule(index);
        }
      });
    });
    
    // Edit rule buttons - open modal for advanced options
    document.querySelectorAll('.edit-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        if (!isNaN(index)) {
          this.openEditRuleModal(index);
        }
      });
    });

    // Quick edit: Rule type
    document.querySelectorAll('.rule-type-quick').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.rules[index]) {
          this.rules[index].type = e.target.value;
          // Update placeholder and label
          const valueInput = e.target.closest('.rule-item').querySelector('.rule-value-quick');
          const label = valueInput?.closest('.form-group').querySelector('.form-label');
          if (label) {
            label.textContent = e.target.value === 'domain' ? 'Site' : 'Filename contains phrase';
          }
          if (valueInput) {
            valueInput.placeholder = e.target.value === 'domain' ? 'e.g., github.com' : 'e.g., invoice, receipt, report';
          }
          this.saveRules();
        }
      });
    });

    // Quick edit: Rule value (domain/extensions)
    document.querySelectorAll('.rule-value-quick').forEach(input => {
      input.addEventListener('blur', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.rules[index]) {
          this.rules[index].value = e.target.value.trim();
          this.saveRules();
        }
      });
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });

    // Quick browse folder for rules - setup folder input based on companion app status
    document.querySelectorAll('.rule-item .folder-display-clickable').forEach(async (display) => {
      const index = parseInt(display.dataset.index);
      if (isNaN(index) || index < 0) return;
      
      const rule = this.rules[index];
      if (!rule) return;
      
      // Hidden input is a sibling, not a child
      const formGroup = display.closest('.form-group');
      const hiddenInput = formGroup ? formGroup.querySelector('.rule-folder-quick') : null;
      const textSpan = display.querySelector('.rule-folder-quick-text');
      
      if (!hiddenInput) {
        console.warn('Could not find hidden input for rule', index);
        return;
      }
      
      await this.setupFolderInput(display, hiddenInput, textSpan, (folder) => {
        rule.folder = folder;
        if (hiddenInput) {
          hiddenInput.value = folder;
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.saveRules();
      });
    });

    // Quick edit: Rule enabled toggle
    document.querySelectorAll('.rule-enabled-quick').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.rules[index]) {
          this.rules[index].enabled = e.target.checked;
          this.saveRules();
          // Update status class
          const item = e.target.closest('.rule-item');
          if (item) {
            if (e.target.checked) {
              item.classList.remove('status-disabled');
              item.classList.add('status-enabled');
            } else {
              item.classList.remove('status-enabled');
              item.classList.add('status-disabled');
            }
          }
        }
      });
    });
  }

  renderGroups() {
    const container = document.getElementById('groups-container');
    const emptyState = document.getElementById('groups-empty');
    
    const groupEntries = Object.entries(this.groups);
    
    if (groupEntries.length === 0) {
      // Clear container and show empty state
      container.innerHTML = '';
      container.appendChild(emptyState);
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    const groupsHTML = groupEntries.map(([name, group], index) => 
      this.createGroupHTML(name, group, index)
    ).join('');
    
    container.innerHTML = groupsHTML + emptyState.outerHTML;
    this.attachGroupListeners();
  }

  createGroupHTML(name, group, index) {
    const enabled = group.enabled !== false;
    const statusClass = enabled ? 'status-enabled' : 'status-disabled';
    const folderIcon = typeof window.getIcon !== 'undefined' ? window.getIcon('folder', 16) : (typeof getIcon !== 'undefined' ? getIcon('folder', 16) : '');
    const browseIcon = typeof window.getIcon !== 'undefined' ? window.getIcon('folder', 14) : (typeof getIcon !== 'undefined' ? getIcon('folder', 14) : '📁');
    
    return `
      <div class="group-item ${statusClass}" data-name="${name}">
        <div class="item-header">
          <div class="item-type">
            <span class="item-icon">${folderIcon}</span>
            <input type="text" class="quick-edit group-name-quick" 
                   value="${name}" 
                   data-name="${name}"
                   placeholder="File type name">
          </div>
          <div class="item-actions">
            <label class="toggle-label quick-toggle">
              <input type="checkbox" class="group-enabled-quick" data-name="${name}" ${enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
            <button class="btn secondary small edit-group" data-name="${name}">Edit</button>
            <button class="btn danger small delete-group" data-name="${name}">Delete</button>
          </div>
        </div>
        <div class="item-content quick-edit-content">
          <div class="form-group quick-edit-group">
            <label class="form-label">Extensions (comma-separated)</label>
            <input type="text" class="form-input quick-edit-input group-extensions-quick" 
                   value="${group.extensions || ''}" 
                   data-name="${name}"
                   placeholder="e.g., stl,obj,3mf,step">
          </div>
          <div class="form-group quick-edit-group">
            <label class="form-label">Destination Folder</label>
            <div class="folder-display-clickable" style="cursor: pointer; padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-elevated); display: flex; align-items: center; gap: 8px;" data-name="${name}">
              ${browseIcon}
              <span class="group-folder-quick-text" style="flex: 1; color: var(--text-primary);" data-name="${name}">${group.folder || 'Downloads'}</span>
              <span style="color: var(--text-secondary); font-size: 11px;">Click to browse</span>
            </div>
            <input type="hidden" class="group-folder-quick" value="${group.folder || 'Downloads'}" data-name="${name}">
          </div>
        </div>
      </div>
    `;
  }

  attachGroupListeners() {
    // Delete group buttons
    document.querySelectorAll('.delete-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = e.currentTarget.dataset.name;
        if (name) {
          this.deleteGroup(name);
        }
      });
    });
    
    // Edit group buttons - open modal for advanced options
    document.querySelectorAll('.edit-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = e.currentTarget.dataset.name;
        if (name) {
          this.openEditGroupModal(name);
        }
      });
    });

    // Quick edit: Group name
    document.querySelectorAll('.group-name-quick').forEach(input => {
      input.addEventListener('blur', (e) => {
        const oldName = e.target.dataset.name;
        const newName = e.target.value.trim();
        if (oldName && newName && oldName !== newName && !this.groups[newName]) {
          this.groups[newName] = this.groups[oldName];
          delete this.groups[oldName];
          this.saveRules();
          this.renderGroups(); // Refresh to update data-name attributes
        } else if (!newName) {
          e.target.value = oldName; // Revert if empty
        }
      });
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });

    // Quick edit: Group extensions
    document.querySelectorAll('.group-extensions-quick').forEach(input => {
      input.addEventListener('blur', (e) => {
        const name = e.target.dataset.name;
        if (name && this.groups[name]) {
          this.groups[name].extensions = e.target.value.trim();
          this.saveRules();
        }
      });
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });

    // Quick browse folder for groups - setup folder input based on companion app status
    document.querySelectorAll('.group-item .folder-display-clickable').forEach(async (display) => {
      const name = display.dataset.name;
      if (!name || !this.groups[name]) return;
      
      // Hidden input is a sibling, not a child
      const formGroup = display.closest('.form-group');
      const hiddenInput = formGroup ? formGroup.querySelector('.group-folder-quick') : null;
      const textSpan = display.querySelector('.group-folder-quick-text');
      
      if (!hiddenInput) {
        console.warn('Could not find hidden input for group', name);
        return;
      }
      
      await this.setupFolderInput(display, hiddenInput, textSpan, (folder) => {
        this.groups[name].folder = folder;
        if (hiddenInput) {
          hiddenInput.value = folder;
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.saveRules();
      });
    });

    // Quick edit: Group enabled toggle
    document.querySelectorAll('.group-enabled-quick').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const name = e.target.dataset.name;
        if (name && this.groups[name]) {
          this.groups[name].enabled = e.target.checked;
          this.saveRules();
          // Update status class
          const item = e.target.closest('.group-item');
          if (item) {
            if (e.target.checked) {
              item.classList.remove('status-disabled');
              item.classList.add('status-enabled');
            } else {
              item.classList.remove('status-enabled');
              item.classList.add('status-disabled');
            }
          }
        }
      });
    });
  }


  setupModalListeners() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('modal-cancel');
    const selectBtn = document.getElementById('modal-select');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeModal());
    }

    // Track if user is selecting text to prevent closing modal during selection
    let isSelecting = false;

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        isSelecting = false;
      }
    });

    overlay.addEventListener('mousemove', (e) => {
      // If mouse moves during mousedown, user is selecting
      if (e.buttons === 1 && e.target !== overlay) {
        isSelecting = true;
      }
    });

    overlay.addEventListener('click', (e) => {
      // Only close if clicking overlay directly AND not selecting text
      if (e.target === overlay && !isSelecting) {
        this.closeModal();
      }
      isSelecting = false;
    });

    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        // Modal selection handled by native picker now
        this.closeModal();
      });
    }
  }

  /**
   * Opens folder picker - uses native OS dialog if companion app available, otherwise shows modal.
   * 
   * Inputs:
   *   - callback: Function to call with selected folder path
   * 
   * Outputs: None (calls callback with selected path)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for communicating with background script
   */
  async openFolderPicker(callback) {
    // Prevent multiple simultaneous folder picker opens
    if (this.folderPickerOpen) {
      console.log('Folder picker already open, ignoring');
      return;
    }
    
    this.folderPickerOpen = true;
    this.folderSelectCallback = callback;
    
    try {
      // Check if companion app is available (with retry logic)
      const companionStatus = await this.checkCompanionAppStatusHelper();
      
      if (companionStatus && companionStatus.installed) {
        // Use native folder picker
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
          
          console.log('Native folder picker response:', response);
          
          if (response && response.success) {
            if (response.path) {
              // User selected a folder via native picker
              console.log('Folder selected:', response.path);
              if (callback) {
                callback(response.path);
              }
              return;
            } else {
              // User cancelled (path is null)
              console.log('User cancelled folder selection');
              if (callback) callback(null);
              return;
            }
          } else if (response && response.error) {
            if (response.error.includes('cancelled') || response.error.includes('CANCELLED')) {
              // User cancelled - don't show modal
              console.log('User cancelled folder selection (error)');
              if (callback) callback(null);
              return;
            } else {
              // Error (but not cancellation)
              console.error('Native folder picker error:', response.error);
              if (callback) callback(null);
              return;
            }
          } else {
            // No response or unexpected format - show error
            console.error('Unexpected native folder picker response:', response);
            if (callback) callback(null);
            return;
          }
        } catch (error) {
          // Native picker failed
          console.error('Native picker failed:', error.message);
          if (callback) callback(null);
          return;
        }
      } else {
        // Companion app not installed - show error
        console.log('Companion app not available for folder picking');
        if (callback) callback(null);
        return;
      }
    } catch (error) {
      // Companion app check failed - show error
      console.log('Companion app check failed:', error);
      if (callback) callback(null);
    } finally {
      // CRITICAL: Always clear the flag, no matter what happens
      this.folderPickerOpen = false;
    }
  }

  closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
      modal.classList.remove('active');
    }
    
    // If canceling a newly added rule, remove it
    if (this.newlyAddedRuleIndex !== null && this.editingRuleIndex === this.newlyAddedRuleIndex) {
      this.rules.splice(this.newlyAddedRuleIndex, 1);
      this.renderRules();
      this.newlyAddedRuleIndex = null;
    }
    
    // If canceling a newly added group, remove it
    if (this.newlyAddedGroupName !== null && this.editingGroupName === this.newlyAddedGroupName) {
      delete this.groups[this.newlyAddedGroupName];
      this.renderGroups();
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
    
    // Update modal content for rule editing
    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit Rule</h3>
        <button class="modal-close" id="close-modal">
          ${typeof window.getIcon !== 'undefined' ? window.getIcon('x', 16) : (typeof getIcon !== 'undefined' ? getIcon('x', 16) : '×')}
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
        
        <div class="rule-edit-warning" style="margin-top: 12px; padding: 8px 12px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 12px; color: #1565c0;">
          <strong>Note:</strong> Rule edits apply to future downloads. They may not affect current downloads.
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
    
    // Attach event listeners
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    
    // Setup folder input based on companion app status
    const folderDisplay = document.getElementById('edit-rule-folder-display');
    const folderText = document.getElementById('edit-rule-folder-text');
    const folderInput = document.getElementById('edit-rule-folder');
    
    if (folderDisplay && folderInput) {
      this.setupFolderInput(folderDisplay, folderInput, folderText, (folder) => {
        console.log('[OPTIONS EDIT RULE] Folder updated to:', folder);
      });
    }
    
    // Update label and placeholder when rule type changes
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
    
    // Advanced section toggle
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
   * Saves the currently edited rule
   */
  saveEditedRule() {
    if (this.editingRuleIndex === null) return;
    
    const type = document.getElementById('edit-rule-type').value;
    const value = document.getElementById('edit-rule-value').value.trim();
    const folderInput = document.getElementById('edit-rule-folder');
    const folder = folderInput ? folderInput.value.trim() : 'Downloads';
    const priorityInput = document.getElementById('edit-rule-priority').value;
    const priority = Math.max(0.1, Math.min(10, Math.round(parseFloat(priorityInput) * 10) / 10)) || 2.0;
    const enabled = document.getElementById('edit-rule-enabled').checked;
    
    console.log('[OPTIONS SAVE RULE] Saving rule with folder:', folder);
    console.log('[OPTIONS SAVE RULE] Folder input value:', folderInput?.value);
    
    this.rules[this.editingRuleIndex] = {
      type,
      value,
      folder,
      priority,
      enabled
    };
    
    console.log('[OPTIONS SAVE RULE] Rule to save:', this.rules[this.editingRuleIndex]);
    
    // Clear newly added flag since it's been saved
    if (this.newlyAddedRuleIndex === this.editingRuleIndex) {
      this.newlyAddedRuleIndex = null;
    }
    
    this.saveRules();
    this.renderRules();
    this.closeModal();
    this.showStatus('Rule saved', 'success');
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
    
    // Update modal content for group editing
    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit File Type</h3>
        <button class="modal-close" id="close-modal">
          ${typeof window.getIcon !== 'undefined' ? window.getIcon('x', 16) : (typeof getIcon !== 'undefined' ? getIcon('x', 16) : '×')}
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
        
        <div class="rule-edit-warning" style="margin-top: 12px; padding: 8px 12px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 12px; color: #1565c0;">
          <strong>Note:</strong> Rule edits apply to future downloads. They may not affect current downloads.
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
    
    // Attach event listeners
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    
    // Setup folder input based on companion app status
    const folderDisplay = document.getElementById('edit-group-folder-display');
    const folderText = document.getElementById('edit-group-folder-text');
    const folderInput = document.getElementById('edit-group-folder');
    
    if (folderDisplay && folderInput) {
      this.setupFolderInput(folderDisplay, folderInput, folderText, (folder) => {
        console.log('[OPTIONS EDIT GROUP] Folder updated to:', folder);
      });
    }
    
    // Advanced section toggle
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
   * Saves the currently edited group
   */
  saveEditedGroup() {
    if (!this.editingGroupName) return;
    
    const newName = document.getElementById('edit-group-name').value.trim();
    const extensions = document.getElementById('edit-group-extensions').value.trim();
    const folderInput = document.getElementById('edit-group-folder');
    const folder = folderInput ? folderInput.value.trim() : 'Downloads';
    const priorityInput = document.getElementById('edit-group-priority').value;
    const priority = Math.max(0.1, Math.min(10, Math.round(parseFloat(priorityInput) * 10) / 10)) || 3.0;
    const overrideDomainRules = document.getElementById('edit-group-override').checked;
    const enabled = document.getElementById('edit-group-enabled').checked;
    
    console.log('[OPTIONS SAVE GROUP] Saving group with folder:', folder);
    console.log('[OPTIONS SAVE GROUP] Folder input value:', folderInput?.value);
    
    // Handle rename
    if (newName && newName !== this.editingGroupName) {
      delete this.groups[this.editingGroupName];
      // Update newly added flag if renamed
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
    
    // Clear newly added flag since it's been saved
    if (this.newlyAddedGroupName === saveName) {
      this.newlyAddedGroupName = null;
    }
    
    this.saveRules();
    this.renderGroups();
    this.closeModal();
    this.showStatus('File type saved', 'success');
  }

  addRule() {
    // Use pending domain if available, otherwise empty
    const domainValue = this.pendingDomain || '';
    
    this.rules.push({
      type: 'domain',
      value: domainValue,
      folder: 'Downloads',
      priority: 2.0,  // Default priority for rules
      enabled: true
    });
    this.renderRules();
    // Track this as a newly added rule
    this.newlyAddedRuleIndex = this.rules.length - 1;
    // Clear pending domain after using it
    this.pendingDomain = null;
    // Open edit modal for the new rule
    this.openEditRuleModal(this.rules.length - 1);
  }

  async deleteRule(index) {
    this.rules.splice(index, 1);
    // Save updated rules to storage
    await this.saveRules();
    this.renderRules();
    this.showStatus('Rule deleted', 'success');
  }

  addGroup() {
    const name = prompt('Enter file type name:');
    if (name && !this.groups[name]) {
      this.groups[name] = {
        extensions: '',
        folder: 'Downloads',
        priority: 3.0,  // Default priority for file types
        overrideDomainRules: false,
        enabled: true
      };
      this.renderGroups();
      // Track this as a newly added group
      this.newlyAddedGroupName = name;
      // Open edit modal for the new group
      this.openEditGroupModal(name);
    }
  }

  async deleteGroup(name) {
    delete this.groups[name];
    // Save updated groups to storage
    await this.saveRules();
    this.renderGroups();
    this.showStatus('Group deleted', 'success');
  }


  loadDefaultGroups() {
    this.groups = this.getDefaultGroups();
    this.renderGroups();
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
  getDefaultGroups() {
    return {
      videos: {
        extensions: 'mp4,mov,mkv,avi,wmv,flv,webm',
        folder: 'Videos',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      },
      images: {
        extensions: 'jpg,jpeg,png,gif,bmp,svg,webp',
        folder: 'Images',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      },
      documents: {
        extensions: 'pdf,doc,docx,txt,rtf,odt',
        folder: 'Documents',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      },
      '3d-files': {
        extensions: 'stl,obj,3mf,step,stp,ply',
        folder: '3D Files',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      },
      archives: {
        extensions: 'zip,rar,7z,tar,gz',
        folder: 'Archives',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      },
      software: {
        extensions: 'exe,msi,dmg,deb,rpm,pkg',
        folder: 'Software',
        priority: 3.0,
        overrideDomainRules: false,
        enabled: true
      }
    };
  }

  /**
   * Saves rules and groups to storage (used for quick updates like delete/add).
   * 
   * Inputs: None (uses this.rules and this.groups)
   * 
   * Outputs: None (saves to storage)
   */
  async saveRules() {
    await chrome.storage.sync.set({
      rules: this.rules,
      groups: this.groups
    });
  }

  /**
   * Saves all configuration options to Chrome sync storage.
   * Collects current settings from UI and persists them.
   * 
   * Inputs: None (reads values from DOM elements)
   * 
   * Outputs: None (saves to storage and shows status)
   * 
   * External Dependencies:
   *   - document.getElementById: Browser DOM API to find elements
   *   - document.querySelector: Browser DOM API to find elements
   *   - chrome.storage.sync.set: Chrome API for saving data
   *   - showStatus: Method in this class to display feedback
   */
  async saveOptions() {
    // Collect current settings from UI form elements
    // checked: Boolean property indicating checkbox state
    const confirmationEnabled = document.getElementById('confirmation-enabled').checked;
    // parseInt: Converts string to integer, multiply by 1000 to convert seconds to milliseconds
    //   Inputs: String value
    //   Outputs: Integer
    const confirmationTimeout = parseInt(document.getElementById('confirmation-timeout').value) * 1000;
    // querySelector: Finds first matching element
    //   Inputs: CSS selector string ('input[name="conflict-resolution"]:checked')
    //   Outputs: Element or null
    const conflictResolution = document.querySelector('input[name="conflict-resolution"]:checked')?.value || 'auto';
    const defaultFolderInput = document.getElementById('default-folder');
    const defaultFolder = defaultFolderInput ? defaultFolderInput.value : 'Downloads';
    
    // Save all configuration to sync storage
    // chrome.storage.sync.set: Stores data in sync storage
    //   Inputs: Object with key-value pairs
    //   Outputs: Promise resolving when stored
    await chrome.storage.sync.set({
      rules: this.rules,
      groups: this.groups,
      confirmationEnabled: confirmationEnabled,
      confirmationTimeout: confirmationTimeout,
      defaultFolder: defaultFolder,
      conflictResolution: conflictResolution
    });
    
    // Show success message to user
    // showStatus: Displays status message in UI
    this.showStatus('Settings saved successfully!', 'success');
  }

  async resetOptions() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.rules = [];
      this.groups = this.getDefaultGroups();
      this.settings = {
        confirmationEnabled: true,
        confirmationTimeout: 5,
        defaultFolder: 'Downloads',
        conflictResolution: 'auto'
      };
      
      // Save everything
      await chrome.storage.sync.set({
        rules: this.rules,
        groups: this.groups,
        confirmationEnabled: true,
        confirmationTimeout: 5000,
        defaultFolder: 'Downloads',
        conflictResolution: 'auto'
      });
      
      this.setupSettingsListeners();
      this.renderCurrentTab();
      this.showStatus('Settings reset to defaults', 'success');
    }
  }

  showStatus(message, type = 'success') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status-message ${type}`;
    
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status-message';
    }, 3000);
  }
}

// Initialize the options app
document.addEventListener('DOMContentLoaded', () => {
  // Initialize static icons after DOM loads
  if (typeof getIcon !== 'undefined') {
    const iconMap = {
      'options-app-icon': ['folder', 48],
      'rules-empty-icon': ['list', 48],
      'groups-empty-icon': ['folder', 48],
      'add-rule-icon': ['plus', 16],
      'add-group-icon': ['plus', 16],
      'load-defaults-icon': ['refresh-cw', 16],
      'path-icon': ['folder', 20],
      'refresh-folders-icon': ['refresh-cw', 16],
      'create-folder-icon': ['folder-plus', 16],
      'save-options-icon': ['save', 16],
      'reset-options-icon': ['refresh-cw', 16]
    };
    
    Object.entries(iconMap).forEach(([id, [icon, size]]) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = getIcon(icon, size);
    });
  }
  
  new OptionsApp();
});
