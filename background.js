const pendingSuggestions = {};

const defaultGroups = [
  { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi'], folder: 'Videos' },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'], folder: 'Images' },
  { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'], folder: 'Documents' },
  { name: '3D Files', extensions: ['stl', 'obj', '3mf', 'step'], folder: '3D Models' },
  { name: 'Software', extensions: ['exe', 'msi', 'dmg', 'pkg'], folder: 'Software' }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['groups'], (data) => {
    if (!data.groups) {
      chrome.storage.sync.set({ groups: defaultGroups });
    }
  });
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  if (pendingSuggestions[downloadItem.id]) {
    return true; // Already processing
  }

  pendingSuggestions[downloadItem.id] = {
    suggest: suggest,
    timeout: setTimeout(() => {
      console.log(`Download ${downloadItem.id} timed out. Using default path.`);
      suggest(); // Use default behavior
      delete pendingSuggestions[downloadItem.id];
    }, 4500)
  };

  chrome.storage.sync.get(['rules', 'tieBreaker', 'groups', 'defaultPath'], (data) => {
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';
    const groups = data.groups || defaultGroups;
    const defaultPath = data.defaultPath || '';
    const url = downloadItem.url;
    const filename = downloadItem.filename;
    const extension = filename.split('.').pop().toLowerCase();

    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch (e) {}

    let resolvedPath = defaultPath ? `${defaultPath}/${filename}` : filename;

    let domainMatches = rules.filter(rule => rule.type === 'domain' && domain.includes(rule.value));
    let extensionMatches = rules.filter(rule => rule.type === 'extension' && rule.value.split(',').map(ext => ext.trim()).includes(extension));
    let groupMatches = groups.filter(group => group.extensions.includes(extension));

    if (domainMatches.length > 0 && (extensionMatches.length > 0 || groupMatches.length > 0)) {
      if (tieBreaker === 'domain') {
        resolvedPath = `${domainMatches[0].folder}/${filename}`;
      } else if (tieBreaker === 'extension') {
        if (extensionMatches.length > 0) {
          resolvedPath = `${extensionMatches[0].folder}/${filename}`;
        } else {
          resolvedPath = `${groupMatches[0].folder}/${filename}`;
        }
      }
    } else if (domainMatches.length > 0) {
      resolvedPath = `${domainMatches[0].folder}/${filename}`;
    } else if (extensionMatches.length > 0) {
      resolvedPath = `${extensionMatches[0].folder}/${filename}`;
    } else if (groupMatches.length > 0) {
      resolvedPath = `${groupMatches[0].folder}/${filename}`;
    }

    showConfirmationOverlay(downloadItem.id, resolvedPath, domain, extension, downloadItem.url);
  });

  return true;
});

function showConfirmationOverlay(downloadId, path, domain, filetype, url) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showOverlay',
        downloadId,
        path,
        domain,
        filetype,
        url
      });
    } else {
      const pending = pendingSuggestions[downloadId];
      if (pending) {
        clearTimeout(pending.timeout);
        pending.suggest({ filename: path, conflictAction: 'uniquify' });
        delete pendingSuggestions[downloadId];
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveDownload') {
    const pending = pendingSuggestions[request.downloadId];
    if (pending) {
      clearTimeout(pending.timeout);
      if (request.saveAs) {
        pending.suggest({ saveAs: true });
      } else {
        pending.suggest({ filename: request.path, conflictAction: 'uniquify' });
      }
      delete pendingSuggestions[request.downloadId];
    }
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'addRule') {
    chrome.storage.sync.get(['rules', 'groups'], (data) => {
      const rules = data.rules || [];
      const groups = data.groups || defaultGroups;
      if (request.rule.type === 'group') {
        const group = groups.find(g => g.name === request.rule.group);
        if (group && !group.extensions.includes(request.rule.value)) {
          group.extensions.push(request.rule.value);
        }
      } else {
        rules.push(request.rule);
      }
      chrome.storage.sync.set({ rules, groups }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === 'getGroups') {
    chrome.storage.sync.get(['groups'], (data) => {
      sendResponse({ groups: data.groups || defaultGroups });
    });
    return true;
  } else if (request.action === 'createGroup') {
    chrome.storage.sync.get(['groups'], (data) => {
      const groups = data.groups || defaultGroups;
      groups.push({ name: request.name, extensions: [], folder: request.name });
      chrome.storage.sync.set({ groups }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});

