// Popup functionality with real-time stats and activity tracking

class PopupApp {
  constructor() {
    this.isExtensionEnabled = true;
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.updateDisplay();
    this.loadRecentActivity();
  }

  async loadData() {
    const syncData = await chrome.storage.sync.get([
      'rules', 
      'groups', 
      'extensionEnabled'
    ]);
    
    // Get stats from background script
    const stats = await chrome.runtime.sendMessage({ type: 'getStats' });
    
    this.rules = syncData.rules || [];
    this.groups = syncData.groups || {};
    this.isExtensionEnabled = syncData.extensionEnabled !== false;
    this.stats = stats || {
      totalDownloads: 0,
      routedDownloads: 0,
      recentActivity: []
    };
  }

  setupEventListeners() {
    // Open options page
    document.getElementById('open-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Toggle extension
    document.getElementById('toggle-extension').addEventListener('click', () => {
      this.toggleExtension();
    });

    // Help and feedback links
    document.getElementById('help-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension#readme' });
    });

    document.getElementById('feedback-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues' });
    });
  }

  updateDisplay() {
    // Update stats
    document.getElementById('rules-count').textContent = this.rules.length;
    document.getElementById('groups-count').textContent = Object.keys(this.groups).length;
    document.getElementById('downloads-count').textContent = this.stats.totalDownloads;

    // Update toggle button
    const toggleBtn = document.getElementById('toggle-extension');
    const toggleIcon = document.getElementById('toggle-icon');
    const toggleText = document.getElementById('toggle-text');
    const statusIndicator = document.getElementById('status-indicator');

    if (this.isExtensionEnabled) {
      toggleIcon.textContent = '⏸️';
      toggleText.textContent = 'Pause';
      toggleBtn.classList.remove('disabled');
      statusIndicator.style.background = 'var(--success-color)';
    } else {
      toggleIcon.textContent = '▶️';
      toggleText.textContent = 'Resume';
      toggleBtn.classList.add('disabled');
      statusIndicator.style.background = 'var(--error-color)';
    }
  }

  loadRecentActivity() {
    const activityList = document.getElementById('activity-list');
    const activities = this.stats.recentActivity || [];
    
    if (activities.length === 0) {
      activityList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>No recent downloads</p>
        </div>
      `;
      return;
    }

    activityList.innerHTML = activities
      .slice(0, 5) // Show only last 5
      .map(activity => this.createActivityItem(activity))
      .join('');
  }

  createActivityItem(activity) {
    const timeAgo = this.getTimeAgo(activity.timestamp);
    const icon = this.getFileIcon(activity.filename);
    const routedBadge = activity.routed ? '<span class="routed-badge">📁</span>' : '';
    
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

  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  async toggleExtension() {
    this.isExtensionEnabled = !this.isExtensionEnabled;
    
    await chrome.storage.sync.set({ 
      extensionEnabled: this.isExtensionEnabled 
    });
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'toggleExtension',
      enabled: this.isExtensionEnabled
    });
    
    this.updateDisplay();
    
    // Show feedback
    this.showToast(
      this.isExtensionEnabled 
        ? 'Extension enabled' 
        : 'Extension paused'
    );
  }

  showToast(message) {
    // Create toast notification
    const toast = document.createElement('div');
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
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  getFileIcon(filename) {
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

// Add CSS animations
const style = document.createElement('style');
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
document.head.appendChild(style);

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupApp();
});
