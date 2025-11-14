// Enhanced Content Script with Shadow DOM and Fallback Notifications

class DownloadOverlay {
  constructor() {
    this.shadowRoot = null;
    this.currentOverlay = null;
    this.countdownTimer = null;
    this.currentDownloadInfo = null;
    this.fallbackNotificationId = null;
    this.rulesEditorVisible = false;
    this.locationPickerVisible = false;
    this.timeLeft = 5000; // 5 seconds
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'showDownloadOverlay') {
        this.showDownloadOverlay(message.downloadInfo);
      }
    });
  }

  createShadowDOM() {
    // Create shadow host
    const host = document.createElement('div');
    host.id = 'download-router-shadow-host';
    host.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
    `;

    // Create shadow root
    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // Add CSS variables and styles
    const style = document.createElement('style');
    style.textContent = this.getCSS();
    this.shadowRoot.appendChild(style);

    document.body.appendChild(host);
    return this.shadowRoot;
  }

  getCSS() {
    return `
      :host {
        --primary: #2563eb;
        --primary-hover: #1d4ed8;
        --success: #059669;
        --success-hover: #047857;
        --warning: #d97706;
        --error: #dc2626;
        --background: #ffffff;
        --surface: #f8fafc;
        --border: #e2e8f0;
        --text: #1e293b;
        --text-muted: #64748b;
        --shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        --shadow-lg: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);
        --radius: 12px;
        --radius-sm: 8px;
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
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        animation: slideIn 0.3s ease-out;
        min-width: 360px;
        max-width: 420px;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .overlay-content {
        background: var(--background);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        backdrop-filter: blur(10px);
        overflow: hidden;
      }

      .overlay-header {
        padding: 20px 20px 16px;
        border-bottom: 1px solid var(--border);
      }

      .overlay-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 8px;
      }

      .overlay-path {
        font-size: 13px;
        color: var(--text-muted);
        word-break: break-all;
        line-height: 1.4;
      }

      .overlay-actions {
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .action-btn {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .action-btn:hover {
        background: var(--border);
        transform: translateY(-1px);
      }

      .countdown-section {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .countdown-bar {
        width: 80px;
        height: 4px;
        background: var(--border);
        border-radius: 2px;
        overflow: hidden;
      }

      .countdown-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--success), var(--warning));
        border-radius: 2px;
        transition: width 0.05s linear;
        width: 0%;
      }

      .save-btn {
        background: linear-gradient(135deg, var(--success), var(--success-hover));
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 10px 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);
      }

      .save-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(5, 150, 105, 0.3);
      }

      .rules-editor {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--background);
        border-radius: var(--radius);
        transform: translateY(100%);
        transition: transform 0.3s ease;
        overflow-y: auto;
        max-height: 500px;
      }

      .rules-editor.visible {
        transform: translateY(0);
      }

      .rules-header {
        padding: 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }

      .rules-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 8px;
      }

      .rules-info {
        font-size: 13px;
        color: var(--text-muted);
      }

      .rules-content {
        padding: 20px;
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
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 13px;
        min-width: 120px;
      }

      .browse-btn {
        background: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .browse-btn:hover {
        background: var(--primary-hover);
      }

      .target-select {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 13px;
        background: var(--background);
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
        background: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .apply-btn:hover {
        background: var(--primary-hover);
      }

      .cancel-btn {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .cancel-btn:hover {
        background: var(--border);
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
          --background: #1e293b;
          --surface: #334155;
          --border: #475569;
          --text: #f1f5f9;
          --text-muted: #94a3b8;
        }
      }
    `;
  }

  async showDownloadOverlay(downloadInfo) {
    try {
      // Try to inject overlay
      if (!this.shadowRoot) {
        this.createShadowDOM();
      }

      this.currentDownloadInfo = downloadInfo;
      this.createOverlayContent();
      this.setupEventListeners();
      this.startCountdown();
    } catch (error) {
      console.error('Failed to show overlay, using fallback notification:', error);
      this.showFallbackNotification(downloadInfo);
    }
  }

  createOverlayContent() {
    const overlayHTML = `
      <div class="overlay-container">
        <div class="overlay-content">
          <div class="overlay-header">
            <div class="overlay-title">Download Routing</div>
            <div class="overlay-path">${this.currentDownloadInfo.resolvedPath}</div>
          </div>
          
          <div class="overlay-actions">
            <button class="action-btn edit-rules-btn">✏️ Edit Rules</button>
            <button class="action-btn change-location-btn">📁 Change Location</button>
            
            <div class="countdown-section">
              <div class="countdown-bar">
                <div class="countdown-fill"></div>
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

    this.shadowRoot.innerHTML = this.shadowRoot.querySelector('style').outerHTML + overlayHTML;
    this.currentOverlay = this.shadowRoot.querySelector('.overlay-container');
  }

  setupEventListeners() {
    const root = this.shadowRoot;
    
    // Save button
    root.querySelector('.save-btn').addEventListener('click', () => {
      this.saveDownload();
    });
    
    // Edit rules button
    root.querySelector('.edit-rules-btn').addEventListener('click', () => {
      this.showRulesEditor();
    });
    
    // Change location button
    root.querySelector('.change-location-btn').addEventListener('click', () => {
      this.showLocationPicker();
    });
    
    // Rules editor events
    this.setupRulesEditorEvents();
    this.setupLocationPickerEvents();
  }

  setupRulesEditorEvents() {
    const root = this.shadowRoot;
    
    // Rule type radio buttons
    root.querySelectorAll('input[name="ruleType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const domainConfig = root.querySelector('.domain-rule-config');
        const extensionConfig = root.querySelector('.extension-rule-config');
        
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

  showRulesEditor() {
    this.pauseCountdown();
    const rulesEditor = this.shadowRoot.querySelector('.rules-editor');
    rulesEditor.classList.add('visible');
    this.rulesEditorVisible = true;
  }

  hideRulesEditor() {
    const rulesEditor = this.shadowRoot.querySelector('.rules-editor');
    rulesEditor.classList.remove('visible');
    this.rulesEditorVisible = false;
    this.resumeCountdown();
  }

  showLocationPicker() {
    this.pauseCountdown();
    const locationPicker = this.shadowRoot.querySelector('.location-picker');
    locationPicker.classList.add('visible');
    this.locationPickerVisible = true;
  }

  hideLocationPicker() {
    const locationPicker = this.shadowRoot.querySelector('.location-picker');
    locationPicker.classList.remove('visible');
    this.locationPickerVisible = false;
    this.resumeCountdown();
  }

  applyRuleChanges() {
    const root = this.shadowRoot;
    const ruleType = root.querySelector('input[name="ruleType"]:checked').value;
    
    if (ruleType === 'domain') {
      const folder = root.querySelector('.domain-rule-config .folder-input').value;
      if (folder) {
        chrome.runtime.sendMessage({
          type: 'addRule',
          rule: {
            type: 'domain',
            value: this.currentDownloadInfo.domain,
            folder: folder
          }
        });
        this.currentDownloadInfo.resolvedPath = `${folder}/${this.currentDownloadInfo.filename}`;
      }
    } else {
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
          this.currentDownloadInfo.resolvedPath = `${folder}/${this.currentDownloadInfo.filename}`;
        }
      } else {
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
    
    // Update display
    root.querySelector('.overlay-path').textContent = this.currentDownloadInfo.resolvedPath;
    this.hideRulesEditor();
  }

  applyLocationChange() {
    const root = this.shadowRoot;
    const newLocation = root.querySelector('.location-picker .folder-input').value;
    if (newLocation) {
      this.currentDownloadInfo.resolvedPath = newLocation;
      root.querySelector('.overlay-path').textContent = newLocation;
    }
    this.hideLocationPicker();
  }

  startCountdown() {
    const countdownFill = this.shadowRoot.querySelector('.countdown-fill');
    this.timeLeft = 5000; // Reset to 5 seconds
    const interval = 50; // Update every 50ms
    
    this.countdownTimer = setInterval(() => {
      this.timeLeft -= interval;
      const percentage = ((5000 - this.timeLeft) / 5000) * 100;
      countdownFill.style.width = percentage + '%';
      
      if (this.timeLeft <= 0) {
        clearInterval(this.countdownTimer);
        this.saveDownload();
      }
    }, interval);
  }

  pauseCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  resumeCountdown() {
    // Resume from current position if not in editor mode
    if (!this.rulesEditorVisible && !this.locationPickerVisible) {
      this.startCountdown();
    }
  }

  saveDownload() {
    // Send message to background script to proceed with download
    chrome.runtime.sendMessage({
      type: 'proceedWithDownload',
      downloadInfo: this.currentDownloadInfo
    });
    
    this.cleanup();
  }

  cleanup() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    
    const shadowHost = document.getElementById('download-router-shadow-host');
    if (shadowHost) {
      shadowHost.remove();
    }
    this.shadowRoot = null;
    this.currentOverlay = null;
    this.rulesEditorVisible = false;
    this.locationPickerVisible = false;
  }

  // Fallback notification when overlay injection fails
  async showFallbackNotification(downloadInfo) {
    try {
      // Create a rich notification with action buttons
      this.fallbackNotificationId = await chrome.runtime.sendMessage({
        type: 'showFallbackNotification',
        downloadInfo: downloadInfo
      });
    } catch (error) {
      console.error('Failed to show fallback notification:', error);
      // Ultimate fallback - just proceed with download
      this.saveDownload();
    }
  }
}

// Initialize the overlay system
const downloadOverlay = new DownloadOverlay();
