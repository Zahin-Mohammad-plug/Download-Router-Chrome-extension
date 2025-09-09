chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  chrome.storage.sync.get(['rules', 'tieBreaker'], (data) => {
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';
    const url = downloadItem.url;
    const filename = downloadItem.filename;
    const extension = filename.split('.').pop().toLowerCase();

    let domainMatches = [];
    let extensionMatches = [];

    try {
      const domain = new URL(url).hostname;
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
        // For now, we can default to domain or just not decide
        finalRule = domainMatches[0]; 
      }
    } else if (domainMatches.length > 0) {
      finalRule = domainMatches[0];
    } else if (extensionMatches.length > 0) {
      finalRule = extensionMatches[0];
    }

    if (finalRule) {
      const newPath = `${finalRule.folder}/${filename}`;
      suggest({ filename: newPath, conflictAction: 'uniquify' });
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Download Routed',
        message: `Saved ${filename} to ${finalRule.folder}`
      });

    } else {
      suggest(); // No rule matched, use default download behavior
    }
  });
  return true; // Required for async suggest
});
