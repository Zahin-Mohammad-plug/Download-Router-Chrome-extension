let pendingDownloads = new Map();

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  chrome.storage.sync.get(['rules', 'tieBreaker', 'confirmationEnabled', 'confirmationTimeout'], (data) => {
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';
    const confirmationEnabled = data.confirmationEnabled !== false; // Default to true
    const confirmationTimeout = data.confirmationTimeout || 5000; // Default 5 seconds
    
    const url = downloadItem.url;
    const filename = downloadItem.filename;
    const extension = filename.split('.').pop().toLowerCase();

    let domainMatches = [];
    let extensionMatches = [];
    let domain = 'unknown';

    try {
      domain = new URL(url).hostname;
      domainMatches = rules.filter(rule => rule.type === 'domain' && domain.includes(rule.value));
    } catch (e) {
      console.error("Invalid URL, cannot determine domain:", url);
    }
    
    extensionMatches = rules.filter(rule => rule.type === 'extension' && rule.value.split(',').map(ext => ext.trim()).includes(extension));

    let finalRule = null;

    if (domainMatches.length > 0 && extensionMatches.length > 0) {
      if (tieBreaker === 'domain') {
        finalRule = domainMatches[0];
      } else if (tieBreaker === 'extension') {
        finalRule = extensionMatches[0];
      } else {
        // "Ask" logic will be handled in the confirmation prompt
        finalRule = domainMatches[0]; 
      }
    } else if (domainMatches.length > 0) {
      finalRule = domainMatches[0];
    } else if (extensionMatches.length > 0) {
      finalRule = extensionMatches[0];
    }

    const resolvedPath = finalRule ? `${finalRule.folder}/${filename}` : filename;
    
    // Store download info for potential confirmation
    const downloadInfo = {
      id: downloadItem.id,
      filename: filename,
      extension: extension,
      domain: domain,
      url: url,
      resolvedPath: resolvedPath,
      originalSuggest: suggest,
      finalRule: finalRule
    };
    
    pendingDownloads.set(downloadItem.id, downloadInfo);

    if (confirmationEnabled) {
      // Show confirmation overlay
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'showDownloadOverlay',
            downloadInfo: downloadInfo
          });
        }
      });
      
      // Auto-proceed after timeout if no user interaction
      setTimeout(() => {
        if (pendingDownloads.has(downloadItem.id)) {
          proceedWithDownload(downloadItem.id);
        }
      }, confirmationTimeout);
      
    } else {
      // Proceed immediately without confirmation
      proceedWithDownload(downloadItem.id);
    }
  });
  return true; // Required for async suggest
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'proceedWithDownload') {
    proceedWithDownload(message.downloadInfo.id, message.downloadInfo.resolvedPath);
  } else if (message.type === 'addRule') {
    addRule(message.rule);
  } else if (message.type === 'addToGroup') {
    addToGroup(message.extension, message.group);
  } else if (message.type === 'showFallbackNotification') {
    showFallbackNotification(message.downloadInfo);
    sendResponse({ success: true });
  } else if (message.type === 'getStats') {
    getStats().then(stats => sendResponse(stats));
    return true;
  }
});

// Fallback notification with action buttons
function showFallbackNotification(downloadInfo) {
  const notificationId = `download_${downloadInfo.id}`;
  
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Download Routing Confirmation',
    message: `Save ${downloadInfo.filename} to ${downloadInfo.resolvedPath}?`,
    buttons: [
      { title: 'Save Now' },
      { title: 'Change Location' }
    ],
    requireInteraction: true
  });

  // Store for button click handling
  pendingDownloads.set(notificationId, downloadInfo);
  
  // Auto-save after 10 seconds
  setTimeout(() => {
    if (pendingDownloads.has(notificationId)) {
      proceedWithDownload(downloadInfo.id);
      chrome.notifications.clear(notificationId);
    }
  }, 10000);
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const downloadInfo = pendingDownloads.get(notificationId);
  if (!downloadInfo) return;

  if (buttonIndex === 0) {
    // Save Now
    proceedWithDownload(downloadInfo.id);
  } else if (buttonIndex === 1) {
    // Change Location - open options page
    chrome.runtime.openOptionsPage();
  }
  
  chrome.notifications.clear(notificationId);
  pendingDownloads.delete(notificationId);
});

// Handle notification clicks (save immediately)
chrome.notifications.onClicked.addListener((notificationId) => {
  const downloadInfo = pendingDownloads.get(notificationId);
  if (downloadInfo) {
    proceedWithDownload(downloadInfo.id);
    chrome.notifications.clear(notificationId);
    pendingDownloads.delete(notificationId);
  }
});

// Get extension stats for popup
async function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['downloadStats'], (data) => {
      const stats = data.downloadStats || {
        totalDownloads: 0,
        routedDownloads: 0,
        recentActivity: []
      };
      resolve(stats);
    });
  });
}

// Update stats when download completes
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    updateDownloadStats(downloadDelta.id);
  }
});

function updateDownloadStats(downloadId) {
  const downloadInfo = Array.from(pendingDownloads.values()).find(info => info.id === downloadId);
  if (!downloadInfo) return;

  chrome.storage.local.get(['downloadStats'], (data) => {
    const stats = data.downloadStats || {
      totalDownloads: 0,
      routedDownloads: 0,
      recentActivity: []
    };

    stats.totalDownloads++;
    if (downloadInfo.finalRule) {
      stats.routedDownloads++;
    }

    // Add to recent activity
    stats.recentActivity.unshift({
      filename: downloadInfo.filename,
      folder: downloadInfo.resolvedPath.split('/')[0] || 'Downloads',
      timestamp: Date.now(),
      routed: !!downloadInfo.finalRule
    });

    // Keep only last 10 activities
    stats.recentActivity = stats.recentActivity.slice(0, 10);

    chrome.storage.local.set({ downloadStats: stats });
  });
}

function proceedWithDownload(downloadId, customPath = null) {
  const downloadInfo = pendingDownloads.get(downloadId);
  if (!downloadInfo) return;
  
  const finalPath = customPath || downloadInfo.resolvedPath;
  
  downloadInfo.originalSuggest({ 
    filename: finalPath, 
    conflictAction: 'uniquify' 
  });
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Download Routed',
    message: `Saved ${downloadInfo.filename} to ${finalPath.split('/')[0] || 'Downloads'}`
  });
  
  pendingDownloads.delete(downloadId);
}

function addRule(rule) {
  chrome.storage.sync.get(['rules'], (data) => {
    const rules = data.rules || [];
    
    // Check if rule already exists
    const existingRuleIndex = rules.findIndex(r => 
      r.type === rule.type && r.value === rule.value
    );
    
    if (existingRuleIndex >= 0) {
      // Update existing rule
      rules[existingRuleIndex] = rule;
    } else {
      // Add new rule
      rules.push(rule);
    }
    
    chrome.storage.sync.set({ rules });
  });
}

function addToGroup(extension, groupName) {
  chrome.storage.sync.get(['groups', 'rules'], (data) => {
    const groups = data.groups || getDefaultGroups();
    const rules = data.rules || [];
    
    if (groups[groupName]) {
      // Add extension to group
      const extensions = groups[groupName].extensions.split(',').map(ext => ext.trim());
      if (!extensions.includes(extension)) {
        extensions.push(extension);
        groups[groupName].extensions = extensions.join(',');
      }
      
      // Update or add rule for this extension group
      const existingRuleIndex = rules.findIndex(r => 
        r.type === 'extension' && r.value.includes(extension)
      );
      
      if (existingRuleIndex >= 0) {
        rules[existingRuleIndex].value = groups[groupName].extensions;
        rules[existingRuleIndex].folder = groups[groupName].folder;
      } else {
        rules.push({
          type: 'extension',
          value: groups[groupName].extensions,
          folder: groups[groupName].folder
        });
      }
      
      chrome.storage.sync.set({ groups, rules });
    }
  });
}

function getDefaultGroups() {
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
