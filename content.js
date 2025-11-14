// Content script for injecting download confirmation overlay

let currentOverlay = null;
let countdownTimer = null;
let currentDownloadInfo = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'showDownloadOverlay') {
    showDownloadOverlay(message.downloadInfo);
  }
});

function showDownloadOverlay(downloadInfo) {
  // Remove existing overlay if present
  if (currentOverlay) {
    currentOverlay.remove();
  }

  currentDownloadInfo = downloadInfo;
  
  // Create overlay container
  currentOverlay = document.createElement('div');
  currentOverlay.id = 'download-router-overlay';
  currentOverlay.innerHTML = `
    <div class="dr-overlay-content">
      <div class="dr-header">
        <div class="dr-saving-to">Saving to: <span class="dr-path">${downloadInfo.resolvedPath}</span></div>
      </div>
      
      <div class="dr-actions">
        <button class="dr-edit-rules-btn">Edit Rules</button>
      </div>
      
      <div class="dr-bottom-bar">
        <button class="dr-change-location-btn">Change Location</button>
        <div class="dr-save-section">
          <div class="dr-countdown-bar">
            <div class="dr-countdown-fill"></div>
          </div>
          <button class="dr-save-btn">Save</button>
        </div>
      </div>
    </div>
    
    <div class="dr-rules-editor" style="display: none;">
      <div class="dr-rules-content">
        <h3>Edit Rules</h3>
        <div class="dr-current-info">
          <div>Domain: <strong>${downloadInfo.domain}</strong></div>
          <div>File type: <strong>.${downloadInfo.extension}</strong></div>
        </div>
        
        <div class="dr-rule-type-selector">
          <label>
            <input type="radio" name="ruleType" value="domain" checked>
            Domain → Folder
          </label>
          <label>
            <input type="radio" name="ruleType" value="extension">
            Filetype → Group or Folder
          </label>
        </div>
        
        <div class="dr-domain-rule" id="dr-domain-rule">
          <div class="dr-rule-row">
            <span>${downloadInfo.domain}</span> → 
            <input type="text" class="dr-folder-input" placeholder="Choose folder">
            <button class="dr-browse-btn">Browse...</button>
          </div>
        </div>
        
        <div class="dr-extension-rule" id="dr-extension-rule" style="display: none;">
          <div class="dr-rule-row">
            Map .${downloadInfo.extension} to:
            <select class="dr-target-type">
              <option value="folder">A Folder</option>
              <option value="group">A Group</option>
            </select>
          </div>
          <div class="dr-folder-target">
            <input type="text" class="dr-folder-input" placeholder="Choose folder">
            <button class="dr-browse-btn">Browse...</button>
          </div>
          <div class="dr-group-target" style="display: none;">
            <select class="dr-group-select">
              <option value="">Select a group...</option>
              <option value="videos">Videos (mp4, mov, mkv, avi)</option>
              <option value="images">Images (jpg, jpeg, png, gif, bmp)</option>
              <option value="documents">Documents (pdf, doc, docx, txt)</option>
              <option value="3d-files">3D Files (stl, obj, 3mf, step)</option>
              <option value="archives">Archives (zip, rar, 7z, tar)</option>
              <option value="software">Software (exe, msi, dmg, deb)</option>
              <option value="new">Create New Group...</option>
            </select>
          </div>
        </div>
        
        <div class="dr-priority-hint">
          Priority: Domain > Group/Filetype > Default
        </div>
        
        <div class="dr-rules-actions">
          <button class="dr-apply-btn">Apply</button>
          <button class="dr-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(currentOverlay);
  
  // Add event listeners
  setupOverlayEvents();
  
  // Start countdown
  startCountdown();
}

function setupOverlayEvents() {
  const overlay = currentOverlay;
  
  // Save button
  overlay.querySelector('.dr-save-btn').addEventListener('click', () => {
    saveDownload();
  });
  
  // Change location button
  overlay.querySelector('.dr-change-location-btn').addEventListener('click', () => {
    pauseCountdown();
    showLocationPicker();
  });
  
  // Edit rules button
  overlay.querySelector('.dr-edit-rules-btn').addEventListener('click', () => {
    pauseCountdown();
    showRulesEditor();
  });
  
  // Rules editor events
  setupRulesEditorEvents();
}

function setupRulesEditorEvents() {
  const overlay = currentOverlay;
  
  // Rule type radio buttons
  overlay.querySelectorAll('input[name="ruleType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const domainRule = overlay.querySelector('#dr-domain-rule');
      const extensionRule = overlay.querySelector('#dr-extension-rule');
      
      if (e.target.value === 'domain') {
        domainRule.style.display = 'block';
        extensionRule.style.display = 'none';
      } else {
        domainRule.style.display = 'none';
        extensionRule.style.display = 'block';
      }
    });
  });
  
  // Target type selector
  overlay.querySelector('.dr-target-type').addEventListener('change', (e) => {
    const folderTarget = overlay.querySelector('.dr-folder-target');
    const groupTarget = overlay.querySelector('.dr-group-target');
    
    if (e.target.value === 'folder') {
      folderTarget.style.display = 'block';
      groupTarget.style.display = 'none';
    } else {
      folderTarget.style.display = 'none';
      groupTarget.style.display = 'block';
    }
  });
  
  // Apply button
  overlay.querySelector('.dr-apply-btn').addEventListener('click', () => {
    applyRuleChanges();
  });
  
  // Cancel button
  overlay.querySelector('.dr-cancel-btn').addEventListener('click', () => {
    hideRulesEditor();
    resumeCountdown();
  });
  
  // Browse buttons
  overlay.querySelectorAll('.dr-browse-btn').forEach(btn => {
    btn.addEventListener('click', showFolderPicker);
  });
}

function startCountdown() {
  const countdownFill = currentOverlay.querySelector('.dr-countdown-fill');
  let timeLeft = 5000; // 5 seconds
  const interval = 50; // Update every 50ms
  
  countdownTimer = setInterval(() => {
    timeLeft -= interval;
    const percentage = ((5000 - timeLeft) / 5000) * 100;
    countdownFill.style.width = percentage + '%';
    
    if (timeLeft <= 0) {
      clearInterval(countdownTimer);
      saveDownload();
    }
  }, interval);
}

function pauseCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
}

function resumeCountdown() {
  // Resume from current position
  startCountdown();
}

function showRulesEditor() {
  const rulesEditor = currentOverlay.querySelector('.dr-rules-editor');
  rulesEditor.style.display = 'block';
}

function hideRulesEditor() {
  const rulesEditor = currentOverlay.querySelector('.dr-rules-editor');
  rulesEditor.style.display = 'none';
}

function showLocationPicker() {
  // For now, show a simple prompt (in a real implementation, this would be a proper folder picker)
  const newLocation = prompt('Enter folder name:', currentDownloadInfo.resolvedPath);
  if (newLocation) {
    currentDownloadInfo.resolvedPath = newLocation;
    currentOverlay.querySelector('.dr-path').textContent = newLocation;
  }
  resumeCountdown();
}

function showFolderPicker() {
  // For now, show a simple prompt (in a real implementation, this would be a proper folder picker)
  const folderName = prompt('Enter folder name:');
  if (folderName) {
    event.target.previousElementSibling.value = folderName;
  }
}

function applyRuleChanges() {
  const overlay = currentOverlay;
  const ruleType = overlay.querySelector('input[name="ruleType"]:checked').value;
  
  if (ruleType === 'domain') {
    const folder = overlay.querySelector('#dr-domain-rule .dr-folder-input').value;
    if (folder) {
      // Save domain rule
      chrome.runtime.sendMessage({
        type: 'addRule',
        rule: {
          type: 'domain',
          value: currentDownloadInfo.domain,
          folder: folder
        }
      });
      currentDownloadInfo.resolvedPath = `${folder}/${currentDownloadInfo.filename}`;
    }
  } else {
    const targetType = overlay.querySelector('.dr-target-type').value;
    if (targetType === 'folder') {
      const folder = overlay.querySelector('.dr-folder-target .dr-folder-input').value;
      if (folder) {
        chrome.runtime.sendMessage({
          type: 'addRule',
          rule: {
            type: 'extension',
            value: currentDownloadInfo.extension,
            folder: folder
          }
        });
        currentDownloadInfo.resolvedPath = `${folder}/${currentDownloadInfo.filename}`;
      }
    } else {
      const group = overlay.querySelector('.dr-group-select').value;
      if (group && group !== 'new') {
        // Handle group assignment
        chrome.runtime.sendMessage({
          type: 'addToGroup',
          extension: currentDownloadInfo.extension,
          group: group
        });
      }
    }
  }
  
  // Update display
  currentOverlay.querySelector('.dr-path').textContent = currentDownloadInfo.resolvedPath;
  hideRulesEditor();
  resumeCountdown();
}

function saveDownload() {
  // Send message to background script to proceed with download
  chrome.runtime.sendMessage({
    type: 'proceedWithDownload',
    downloadInfo: currentDownloadInfo
  });
  
  // Remove overlay
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
  
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
}
