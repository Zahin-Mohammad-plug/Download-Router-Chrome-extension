/**
 * options.js
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
  async checkCompanionAppStatus() {
    try {
      const status = await this.checkCompanionAppStatusHelper();
      
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
    // Save options button - saves all configuration to storage
    document.getElementById('save-options').addEventListener('click', () => this.saveOptions());
    
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
    
    confirmationEnabled.addEventListener('change', (e) => {
      const timeoutSetting = document.getElementById('timeout-setting');
      timeoutSetting.style.opacity = e.target.checked ? '1' : '0.5';
      timeoutSetting.style.pointerEvents = e.target.checked ? 'auto' : 'none';
    });
    
    confirmationTimeout.addEventListener('input', (e) => {
      timeoutValue.textContent = `${e.target.value}s`;
    });
    
    // Initialize
    confirmationEnabled.checked = this.settings.confirmationEnabled;
    confirmationTimeout.value = this.settings.confirmationTimeout;
    timeoutValue.textContent = `${this.settings.confirmationTimeout}s`;
    
    // Default folder setting
    const defaultFolderInput = document.getElementById('default-folder');
    const browseDefaultFolderBtn = document.getElementById('browse-default-folder');
    if (defaultFolderInput) {
      defaultFolderInput.value = this.settings.defaultFolder || 'Downloads';
    }
    if (browseDefaultFolderBtn) {
      browseDefaultFolderBtn.addEventListener('click', () => {
        this.openFolderPicker((folder) => {
          if (folder && defaultFolderInput) {
            defaultFolderInput.value = folder;
          }
        });
      });
    }
    
    // Conflict resolution setting
    const conflictResolution = this.settings.conflictResolution || 'auto';
    const conflictRadio = document.querySelector(`input[name="conflict-resolution"][value="${conflictResolution}"]`);
    if (conflictRadio) {
      conflictRadio.checked = true;
    }
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
    const typeName = rule.type === 'domain' ? 'Domain Rule' : 'Extension Rule';
    const iconName = rule.type === 'domain' ? 'globe' : 'file-type';
    const iconHTML = typeof getIcon !== 'undefined' ? getIcon(iconName, 16) : '';
    const priority = rule.priority !== undefined ? parseFloat(rule.priority).toFixed(1) : '2.0';
    const enabled = rule.enabled !== false;
    
    return `
      <div class="rule-item" data-index="${index}">
        <div class="item-header">
          <div class="item-type">
            <span>${iconHTML}</span>
            ${typeName}
          </div>
          <div class="item-actions">
            <button class="btn secondary small edit-rule" data-index="${index}">Edit</button>
            <button class="btn danger small delete-rule" data-index="${index}">Delete</button>
          </div>
        </div>
        <div class="item-content">
          <div class="form-group">
            <label class="form-label">${rule.type === 'domain' ? 'Domain' : 'Extensions'}</label>
            <input type="text" class="form-input rule-value" value="${rule.value}" data-index="${index}">
          </div>
          <div class="form-group">
            <label class="form-label">Folder</label>
            <div class="folder-picker-btn" data-index="${index}">
              <span>${typeof getIcon !== 'undefined' ? getIcon('folder', 16) : ''}</span>
              <span class="folder-path">${rule.folder}</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select rule-type" data-index="${index}">
              <option value="domain" ${rule.type === 'domain' ? 'selected' : ''}>Domain</option>
              <option value="extension" ${rule.type === 'extension' ? 'selected' : ''}>Extension</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">
              Priority
              <span class="help-text">Lower number = higher priority. Use decimals for fine control (e.g., 1.5, 2.7)</span>
            </label>
            <input type="number" 
                   class="form-input rule-priority" 
                   data-index="${index}"
                   value="${priority}"
                   min="0.1"
                   max="10"
                   step="0.1"
                   placeholder="2.0">
            <div class="priority-hint">
              Default: 2.0 | Common: 1.0 (highest), 2.0 (medium), 3.0 (file types)
            </div>
          </div>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" class="rule-enabled" data-index="${index}" ${enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  attachRuleListeners() {
    // Delete rule buttons
    document.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Use currentTarget instead of target to handle nested elements (like icons)
        const index = parseInt(e.currentTarget.dataset.index || e.target.closest('.delete-rule')?.dataset.index || e.target.dataset.index);
        if (!isNaN(index)) {
          this.deleteRule(index);
        }
      });
    });
    
    // Edit rule inputs
    document.querySelectorAll('.rule-value').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.rules[index].value = e.target.value;
      });
    });
    
    document.querySelectorAll('.rule-type').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.rules[index].type = e.target.value;
      });
    });
    
    // Priority inputs
    document.querySelectorAll('.rule-priority').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        // Parse as float and round to 1 decimal place
        const priority = Math.round(parseFloat(e.target.value) * 10) / 10;
        // Clamp between 0.1 and 10
        this.rules[index].priority = Math.max(0.1, Math.min(10, priority));
        // Update input to show rounded value
        e.target.value = this.rules[index].priority.toFixed(1);
      });
    });
    
    // Enabled checkboxes
    document.querySelectorAll('.rule-enabled').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.rules[index].enabled = e.target.checked;
      });
    });
    
    // Folder picker buttons
    document.querySelectorAll('.folder-picker-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.openFolderPicker((folder) => {
          this.rules[index].folder = folder;
          this.renderRules();
        });
      });
    });
  }

  renderGroups() {
    const container = document.getElementById('groups-container');
    const emptyState = document.getElementById('groups-empty');
    
    const groupEntries = Object.entries(this.groups);
    
    if (groupEntries.length === 0) {
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
    const priority = group.priority !== undefined ? parseFloat(group.priority).toFixed(1) : '3.0';
    const overrideDomainRules = group.overrideDomainRules || false;
    const enabled = group.enabled !== false;
    
    return `
      <div class="group-item" data-name="${name}">
        <div class="item-header">
          <div class="item-type">
            <span>${typeof getIcon !== 'undefined' ? getIcon('folder', 16) : ''}</span>
            File Type
          </div>
          <div class="item-actions">
            <button class="btn secondary small edit-group" data-name="${name}">Edit</button>
            <button class="btn danger small delete-group" data-name="${name}">Delete</button>
          </div>
        </div>
        <div class="item-content">
          <div class="form-group">
            <label class="form-label">File Type Name</label>
            <input type="text" class="form-input group-name" value="${name}" data-name="${name}">
          </div>
          <div class="form-group">
            <label class="form-label">Extensions</label>
            <input type="text" class="form-input group-extensions" value="${group.extensions}" data-name="${name}">
          </div>
          <div class="form-group">
            <label class="form-label">Folder</label>
            <div class="folder-picker-btn" data-name="${name}">
              <span>${typeof getIcon !== 'undefined' ? getIcon('folder', 16) : ''}</span>
              <span class="folder-path">${group.folder}</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">
              Priority
              <span class="help-text">Lower number = higher priority. Use decimals for fine control (e.g., 2.5, 3.2)</span>
            </label>
            <input type="number" 
                   class="form-input group-priority" 
                   data-name="${name}"
                   value="${priority}"
                   min="0.1"
                   max="10"
                   step="0.1"
                   placeholder="3.0">
            <div class="priority-hint">
              Default: 3.0 | File types typically use 2.5-4.0 range
            </div>
          </div>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" class="override-domain" data-name="${name}" ${overrideDomainRules ? 'checked' : ''}>
              <span>Override Domain Rules (forces file type match even if domain rule exists)</span>
            </label>
          </div>
          <div class="form-group">
            <label class="toggle-label">
              <input type="checkbox" class="group-enabled" data-name="${name}" ${enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  attachGroupListeners() {
    // Delete group buttons
    document.querySelectorAll('.delete-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.target.dataset.name;
        this.deleteGroup(name);
      });
    });
    
    // Edit group inputs
    document.querySelectorAll('.group-name').forEach(input => {
      input.addEventListener('change', (e) => {
        const oldName = e.target.dataset.name;
        const newName = e.target.value;
        if (oldName !== newName && newName) {
          this.groups[newName] = this.groups[oldName];
          delete this.groups[oldName];
          this.renderGroups();
        }
      });
    });
    
    document.querySelectorAll('.group-extensions').forEach(input => {
      input.addEventListener('change', (e) => {
        const name = e.target.dataset.name;
        this.groups[name].extensions = e.target.value;
      });
    });
    
    // Priority inputs
    document.querySelectorAll('.group-priority').forEach(input => {
      input.addEventListener('change', (e) => {
        const name = e.target.dataset.name;
        // Parse as float and round to 1 decimal place
        const priority = Math.round(parseFloat(e.target.value) * 10) / 10;
        // Clamp between 0.1 and 10
        this.groups[name].priority = Math.max(0.1, Math.min(10, priority));
        // Update input to show rounded value
        e.target.value = this.groups[name].priority.toFixed(1);
      });
    });
    
    // Override domain rules checkbox
    document.querySelectorAll('.override-domain').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const name = e.target.dataset.name;
        this.groups[name].overrideDomainRules = e.target.checked;
      });
    });
    
    // Enabled checkboxes
    document.querySelectorAll('.group-enabled').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const name = e.target.dataset.name;
        this.groups[name].enabled = e.target.checked;
      });
    });
    
    // Folder picker buttons
    document.querySelectorAll('.folder-picker-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.currentTarget.dataset.name;
        this.openFolderPicker((folder) => {
          this.groups[name].folder = folder;
          this.renderGroups();
        });
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
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
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
              // Error (but not cancellation) - fall through to modal
              console.error('Native folder picker error:', response.error);
            }
          } else {
            // No response or unexpected format - fall through to modal
            console.error('Unexpected native folder picker response:', response);
          }
        } catch (error) {
          // Native picker failed - fall through to modal fallback
          console.error('Native picker failed, using modal fallback:', error.message);
        }
      } else {
        // Companion app not installed - use modal fallback
        console.log('Companion app not available, using modal fallback');
      }
    } catch (error) {
      // Companion app check failed - show error
      console.log('Companion app check failed:', error);
      if (callback) callback(null);
    }
  }

  closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
      modal.classList.remove('active');
    }
    this.folderSelectCallback = null;
  }

  addRule() {
    this.rules.push({
      type: 'domain',
      value: '',
      folder: 'Downloads',
      priority: 2.0,  // Default priority for rules
      enabled: true
    });
    this.renderRules();
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
      
      await this.saveOptions();
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
