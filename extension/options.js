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
    // Current active tab name ('rules', 'groups', 'settings', or 'folders')
    this.currentTab = 'rules';
    // Current download path being viewed
    this.currentPath = '';
    // Array of available folders for browsing
    this.availableFolders = [];
    // Currently selected folder in folder picker
    this.selectedFolder = '';
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
    // Load available folders for browser
    this.loadFolders();
    // Check companion app status and update UI
    this.checkCompanionAppStatus();
  }

  /**
   * Checks companion app installation status and updates UI indicators.
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
      const status = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'checkCompanionApp' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error checking companion app status:', chrome.runtime.lastError.message);
            resolve({ installed: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { installed: false });
          }
        });
      });
      
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
          statusElement.innerHTML = `
            <strong>✓ Companion App Installed</strong><br>
            Version ${status.version || 'unknown'} on ${status.platform || 'unknown'}
          `;
        } else {
          statusElement.style.background = '#fff3e0';
          statusElement.style.color = '#e65100';
          statusElement.style.border = '1px solid #ff9800';
          statusElement.innerHTML = `
            <strong>⚠ Companion App Not Installed</strong><br>
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
      tieBreaker: data.tieBreaker || 'domain',
      confirmationEnabled: data.confirmationEnabled !== false,
      // Convert timeout from milliseconds to seconds for display
      confirmationTimeout: (data.confirmationTimeout || 5000) / 1000
    };
    this.currentPath = data.downloadPath || 'Downloads';
    // Use default folders if none exist in storage
    this.availableFolders = data.availableFolders || this.getCommonFolders();
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
    
    // Folder browser controls
    // Refresh folders button - reloads folder list
    document.getElementById('refresh-folders').addEventListener('click', () => this.loadFolders());
    // Create folder button - prompts user to create new folder
    document.getElementById('create-folder').addEventListener('click', () => this.createFolder());
    
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
    
    // Tie breaker
    document.querySelector(`input[name="tie-breaker"][value="${this.settings.tieBreaker}"]`).checked = true;
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
      case 'groups':
        this.renderGroups();
        break;
      case 'folders':
        this.renderFolders();
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
    const iconClass = rule.type === 'domain' ? 'icon-domain' : 'icon-extension';
    
    return `
      <div class="rule-item" data-index="${index}">
        <div class="item-header">
          <div class="item-type">
            <span class="${iconClass}"></span>
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
              <span class="icon-folder-simple"></span>
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
        </div>
      </div>
    `;
  }

  attachRuleListeners() {
    // Delete rule buttons
    document.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.deleteRule(index);
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
    return `
      <div class="group-item" data-name="${name}">
        <div class="item-header">
          <div class="item-type">
            <span class="icon-folder-simple"></span>
            File Group
          </div>
          <div class="item-actions">
            <button class="btn secondary small edit-group" data-name="${name}">Edit</button>
            <button class="btn danger small delete-group" data-name="${name}">Delete</button>
          </div>
        </div>
        <div class="item-content">
          <div class="form-group">
            <label class="form-label">Group Name</label>
            <input type="text" class="form-input group-name" value="${name}" data-name="${name}">
          </div>
          <div class="form-group">
            <label class="form-label">Extensions</label>
            <input type="text" class="form-input group-extensions" value="${group.extensions}" data-name="${name}">
          </div>
          <div class="form-group">
            <label class="form-label">Folder</label>
            <div class="folder-picker-btn" data-name="${name}">
              <span class="icon-folder-simple"></span>
              <span class="folder-path">${group.folder}</span>
            </div>
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

  renderFolders() {
    const folderList = document.getElementById('folder-list');
    const pathText = document.getElementById('path-text');
    
    pathText.textContent = this.currentPath || 'Downloads';
    
    if (this.availableFolders.length === 0) {
      folderList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon icon-folder-simple"></div>
          <h3>No folders found</h3>
          <p>Create a new folder to get started</p>
        </div>
      `;
      return;
    }
    
    const foldersHTML = this.availableFolders.map(folder => 
      this.createFolderHTML(folder)
    ).join('');
    
    folderList.innerHTML = foldersHTML;
    this.attachFolderListeners();
  }

  createFolderHTML(folder) {
    const iconClass = folder.type === 'folder' ? 'icon-folder-simple' : 'icon-file';
    return `
      <div class="folder-item" data-path="${folder.path}">
        <div class="folder-icon ${iconClass}"></div>
        <div class="folder-info">
          <div class="folder-name">${folder.name}</div>
          <div class="folder-size">${folder.size || 'Folder'}</div>
        </div>
      </div>
    `;
  }

  attachFolderListeners() {
    document.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.selectedFolder = e.currentTarget.dataset.path;
      });
    });
  }

  /**
   * Loads folders from file system using companion app, or falls back to default list.
   * 
   * Inputs: None
   * 
   * Outputs: None (updates this.availableFolders and renders UI)
   * 
   * External Dependencies:
   *   - chrome.runtime.sendMessage: Chrome API for communicating with background script
   */
  async loadFolders() {
    try {
      // Check if companion app is available
      const companionStatus = await chrome.runtime.sendMessage({ type: 'checkCompanionApp' });
      
      if (companionStatus && companionStatus.installed) {
        // Get default Downloads path (platform-specific)
        // For now, use currentPath or default to Downloads
        const defaultPath = this.currentPath || 'Downloads';
        
        // Request folder listing from companion app
        // Note: This requires absolute path, so we'll need to resolve Downloads path
        // For now, use default list until we implement path resolution
        this.availableFolders = this.getCommonFolders();
        
        // Show indicator that companion app is available
        const folderList = document.getElementById('folder-list');
        if (folderList) {
          const statusIndicator = document.createElement('div');
          statusIndicator.style.cssText = 'padding: 8px; background: #e3f2fd; color: #1565c0; font-size: 12px; border-radius: 4px; margin-bottom: 8px;';
          statusIndicator.textContent = '✓ Companion app detected - Native folder picker available';
          folderList.parentElement.insertBefore(statusIndicator, folderList);
        }
      } else {
        // Fallback to default list
        this.availableFolders = this.getCommonFolders();
      }
    } catch (error) {
      // Fallback to default list on error
      console.log('Companion app not available, using default folder list');
    this.availableFolders = this.getCommonFolders();
    }
    
    this.renderFolders();
  }

  getCommonFolders() {
    return [
      { name: '3D Printing', path: '3D Printing', type: 'folder', size: 'Folder' },
      { name: 'Documents', path: 'Documents', type: 'folder', size: 'Folder' },
      { name: 'Images', path: 'Images', type: 'folder', size: 'Folder' },
      { name: 'Software', path: 'Software', type: 'folder', size: 'Folder' },
      { name: 'Videos', path: 'Videos', type: 'folder', size: 'Folder' },
      { name: 'Archives', path: 'Archives', type: 'folder', size: 'Folder' },
      { name: 'Music', path: 'Music', type: 'folder', size: 'Folder' },
      { name: 'Games', path: 'Games', type: 'folder', size: 'Folder' },
      { name: 'Work', path: 'Work', type: 'folder', size: 'Folder' },
      { name: 'Personal', path: 'Personal', type: 'folder', size: 'Folder' }
    ];
  }

  setupModalListeners() {
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('modal-cancel');
    const selectBtn = document.getElementById('modal-select');
    
    closeBtn.addEventListener('click', () => this.closeModal());
    cancelBtn.addEventListener('click', () => this.closeModal());
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
    
    selectBtn.addEventListener('click', () => {
      if (this.selectedFolder && this.folderSelectCallback) {
        this.folderSelectCallback(this.selectedFolder);
        this.closeModal();
      }
    });
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
      // Check if companion app is available
      // Wrap in Promise to handle service worker wake-up
      const companionStatus = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'checkCompanionApp' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error checking companion app:', chrome.runtime.lastError.message);
            resolve({ installed: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { installed: false });
          }
        });
      });
      
      if (companionStatus && companionStatus.installed) {
        // Use native folder picker
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'pickFolderNative',
              startPath: this.currentPath || null
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error calling native folder picker:', chrome.runtime.lastError.message);
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false, error: 'No response' });
              }
            });
          });
          
          if (response.success && response.path) {
            // User selected a folder via native picker
            if (callback) {
              callback(response.path);
            }
            return;
          } else if (response.error && !response.error.includes('cancelled')) {
            // Error (but not cancellation) - fall through to modal
            console.error('Native folder picker error:', response.error);
          } else {
            // User cancelled - don't show modal
            return;
          }
        } catch (error) {
          // Native picker failed - fall through to modal fallback
          console.log('Native picker not available, using modal fallback:', error.message);
        }
      }
    } catch (error) {
      // Companion app check failed - use modal fallback
      console.log('Companion app check failed, using modal fallback');
    }
    
    // Fallback: Show modal with default folder list
    const modal = document.getElementById('modal-overlay');
    const folderTree = document.getElementById('folder-tree');
    
    // Populate folder tree with available folders
    const foldersHTML = this.availableFolders.map(folder => 
      this.createFolderHTML(folder)
    ).join('');
    
    folderTree.innerHTML = foldersHTML;
    
    // Attach folder selection listeners
    folderTree.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        folderTree.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.selectedFolder = e.currentTarget.dataset.path;
      });
    });
    
    modal.classList.add('active');
  }

  closeModal() {
    const modal = document.getElementById('modal-overlay');
    modal.classList.remove('active');
    this.selectedFolder = '';
    this.folderSelectCallback = null;
  }

  addRule() {
    this.rules.push({
      type: 'domain',
      value: '',
      folder: 'Downloads'
    });
    this.renderRules();
  }

  deleteRule(index) {
    this.rules.splice(index, 1);
    this.renderRules();
  }

  addGroup() {
    const name = prompt('Enter group name:');
    if (name && !this.groups[name]) {
      this.groups[name] = {
        extensions: '',
        folder: 'Downloads'
      };
      this.renderGroups();
    }
  }

  deleteGroup(name) {
    delete this.groups[name];
    this.renderGroups();
  }

  createFolder() {
    const name = prompt('Enter folder name:');
    if (name) {
      this.availableFolders.push({
        name: name,
        path: name,
        type: 'folder',
        size: 'Folder'
      });
      this.renderFolders();
    }
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
    //   Inputs: CSS selector string ('input[name="tie-breaker"]:checked')
    //   Outputs: Element or null
    const tieBreaker = document.querySelector('input[name="tie-breaker"]:checked').value;
    
    // Save all configuration to sync storage
    // chrome.storage.sync.set: Stores data in sync storage
    //   Inputs: Object with key-value pairs
    //   Outputs: Promise resolving when stored
    await chrome.storage.sync.set({
      rules: this.rules,
      groups: this.groups,
      tieBreaker: tieBreaker,
      confirmationEnabled: confirmationEnabled,
      confirmationTimeout: confirmationTimeout,
      availableFolders: this.availableFolders
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
        tieBreaker: 'domain',
        confirmationEnabled: true,
        confirmationTimeout: 5
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
  new OptionsApp();
});
