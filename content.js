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
        // Update resolved path with new folder
        this.currentDownloadInfo.resolvedPath = `${folder}/${this.currentDownloadInfo.filename}`;
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
          this.currentDownloadInfo.resolvedPath = `${folder}/${this.currentDownloadInfo.filename}`;
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
   * 
   * Inputs: None (reads input value from shadow root)
   * 
   * Outputs: None (updates download info and UI)
   */
  applyLocationChange() {
    const root = this.shadowRoot;
    const newLocation = root.querySelector('.location-picker .folder-input').value;
    if (newLocation) {
      this.currentDownloadInfo.resolvedPath = newLocation;
      root.querySelector('.overlay-path').textContent = newLocation;
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
    // Get reference to countdown progress bar element
    const countdownFill = this.shadowRoot.querySelector('.countdown-fill');
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
      // Update progress bar width
      // style.width: Sets element's width CSS property
      //   Inputs: Width string with unit (percentage)
      //   Outputs: None (modifies element style)
      countdownFill.style.width = percentage + '%';
      
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
    // chrome.runtime.sendMessage: Sends message to background script
    //   Inputs: Message object with type and download info
    //   Outputs: None (fire-and-forget message)
    chrome.runtime.sendMessage({
      type: 'proceedWithDownload',
      downloadInfo: this.currentDownloadInfo
    });
    
    // Remove overlay from page after sending message
    this.cleanup();
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
