chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showOverlay') {
    if (document.getElementById('download-router-overlay-iframe')) {
      return; // Overlay already exists
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'download-router-overlay-iframe';
    iframe.src = chrome.runtime.getURL('overlay.html') + `?downloadId=${request.downloadId}&path=${encodeURIComponent(request.path)}&domain=${encodeURIComponent(request.domain)}&filetype=${encodeURIComponent(request.filetype)}&url=${encodeURIComponent(request.url)}`;
    document.body.appendChild(iframe);
    
    sendResponse({ success: true });
  } else if (request.action === 'closeOverlay') {
    const iframe = document.getElementById('download-router-overlay-iframe');
    if (iframe) {
      iframe.remove();
    }
    sendResponse({ success: true });
  }
});
