// Enhanced Options Page with Shadow DOM, Folder Picker, and Modern UI

class OptionsApp {
  constructor() {
    this.currentTab = 'rules';
    this.currentPath = '';
    this.availableFolders = [];
    this.selectedFolder = '';
    this.rules = [];
    this.groups = {};
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.setupTabNavigation();
    this.renderCurrentTab();
    this.loadFolders();
  }

  async loadData() {
    const data = await chrome.storage.sync.get([
      'rules', 
      'groups', 
      'tieBreaker', 
      'confirmationEnabled', 
      'confirmationTimeout',
      'downloadPath',
      'availableFolders'
    ]);
    
    this.rules = data.rules || [];
    this.groups = data.groups || this.getDefaultGroups();
    this.settings = {
      tieBreaker: data.tieBreaker || 'domain',
      confirmationEnabled: data.confirmationEnabled !== false,
      confirmationTimeout: (data.confirmationTimeout || 5000) / 1000
    };
    this.currentPath = data.downloadPath || 'Downloads';
    this.availableFolders = data.availableFolders || this.getCommonFolders();
  }

  setupEventListeners() {
    // Save options
    document.getElementById('save-options').addEventListener('click', () => this.saveOptions());
    
    // Reset options
    document.getElementById('reset-options').addEventListener('click', () => this.resetOptions());
    
    // Add rule/group
    document.getElementById('add-rule').addEventListener('click', () => this.addRule());
    document.getElementById('add-group').addEventListener('click', () => this.addGroup());
    document.getElementById('load-defaults').addEventListener('click', () => this.loadDefaultGroups());
    
    // Settings
    this.setupSettingsListeners();
    
    // Folder browser
    document.getElementById('refresh-folders').addEventListener('click', () => this.loadFolders());
    document.getElementById('create-folder').addEventListener('click', () => this.createFolder());
    
    // Modal
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
    const typeIcon = rule.type === 'domain' ? '🌐' : '📄';
    const typeName = rule.type === 'domain' ? 'Domain Rule' : 'Extension Rule';
    
    return `
      <div class="rule-item" data-index="${index}">
        <div class="item-header">
          <div class="item-type">
            <span>${typeIcon}</span>
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
              <span>📁</span>
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
            <span>📁</span>
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
              <span>📁</span>
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
          <div class="empty-icon">📁</div>
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
    return `
      <div class="folder-item" data-path="${folder.path}">
        <div class="folder-icon">${folder.type === 'folder' ? '📁' : '📄'}</div>
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

  async loadFolders() {
    // Simulate folder loading - in a real implementation, this would fetch actual folders
    this.availableFolders = this.getCommonFolders();
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

  openFolderPicker(callback) {
    this.folderSelectCallback = callback;
    const modal = document.getElementById('modal-overlay');
    const folderTree = document.getElementById('folder-tree');
    
    // Populate folder tree
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

  async saveOptions() {
    // Collect settings
    const confirmationEnabled = document.getElementById('confirmation-enabled').checked;
    const confirmationTimeout = parseInt(document.getElementById('confirmation-timeout').value) * 1000;
    const tieBreaker = document.querySelector('input[name="tie-breaker"]:checked').value;
    
    // Save to storage
    await chrome.storage.sync.set({
      rules: this.rules,
      groups: this.groups,
      tieBreaker: tieBreaker,
      confirmationEnabled: confirmationEnabled,
      confirmationTimeout: confirmationTimeout,
      availableFolders: this.availableFolders
    });
    
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
