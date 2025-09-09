let countdownInterval;
let timeLeft = 5; // seconds
const totalTime = 5;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const downloadId = urlParams.get('downloadId');
  const initialPath = urlParams.get('path');
  const domain = urlParams.get('domain');
  const filetype = urlParams.get('filetype');

  document.getElementById('path').textContent = initialPath;
  document.getElementById('domain-input').value = domain;
  document.getElementById('current-filetype').textContent = filetype;

  loadGroups();

  startCountdown();

  document.getElementById('edit-rules').addEventListener('click', () => {
    pauseCountdown();
    document.getElementById('edit-rules-section').style.display = 'block';
  });

  document.getElementById('cancel-edit').addEventListener('click', () => {
    document.getElementById('edit-rules-section').style.display = 'none';
    resumeCountdown();
  });

  document.getElementById('rule-type').addEventListener('change', (e) => {
    if (e.target.value === 'domain') {
      document.getElementById('domain-rule').style.display = 'block';
      document.getElementById('filetype-rule').style.display = 'none';
    } else {
      document.getElementById('domain-rule').style.display = 'none';
      document.getElementById('filetype-rule').style.display = 'block';
    }
  });

  document.getElementById('filetype-mapping').addEventListener('change', (e) => {
    if (e.target.value === 'folder') {
      document.getElementById('folder-mapping').style.display = 'block';
      document.getElementById('group-mapping').style.display = 'none';
    } else {
      document.getElementById('folder-mapping').style.display = 'none';
      document.getElementById('group-mapping').style.display = 'block';
    }
  });

  document.getElementById('apply-rule').addEventListener('click', () => {
    applyRule(downloadId);
    document.getElementById('edit-rules-section').style.display = 'none';
    resumeCountdown();
  });

  document.getElementById('change-location').addEventListener('click', () => {
    pauseCountdown();
    chrome.runtime.sendMessage({
      action: 'saveDownload',
      downloadId: parseInt(downloadId),
      saveAs: true
    }, () => {
      chrome.runtime.sendMessage({ action: 'closeOverlay' });
    });
  });

  document.getElementById('save').addEventListener('click', () => {
    saveDownload(downloadId, document.getElementById('path').textContent);
  });

  document.getElementById('choose-domain-folder').addEventListener('click', () => {
    // For simplicity, use prompt. In a real extension, you might use a folder picker.
    const folder = prompt('Choose folder:');
    if (folder) {
      document.getElementById('domain-folder').value = folder;
    }
  });

  document.getElementById('choose-filetype-folder').addEventListener('click', () => {
    const folder = prompt('Choose folder:');
    if (folder) {
      document.getElementById('filetype-folder').value = folder;
    }
  });

  document.getElementById('create-new-group').addEventListener('click', () => {
    const groupName = prompt('New group name:');
    if (groupName) {
      chrome.runtime.sendMessage({ action: 'createGroup', name: groupName }, (response) => {
        if (response.success) {
          loadGroups();
          document.getElementById('group-select').value = groupName;
        }
      });
    }
  });
});

function startCountdown() {
  timeLeft = totalTime;
  updateCountdownBar();
  countdownInterval = setInterval(() => {
    timeLeft -= 0.1;
    updateCountdownBar();
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      saveDownload(downloadId, document.getElementById('path').textContent);
    }
  }, 100);
}

function pauseCountdown() {
  clearInterval(countdownInterval);
}

function resumeCountdown() {
  startCountdown();
}

function updateCountdownBar() {
  const percentage = ((totalTime - timeLeft) / totalTime) * 100;
  document.getElementById('countdown-bar').style.width = `${percentage}%`;
}

function saveDownload(downloadId, path) {
  chrome.runtime.sendMessage({ action: 'saveDownload', downloadId: parseInt(downloadId), path }, () => {
    chrome.runtime.sendMessage({ action: 'closeOverlay' });
  });
}

function applyRule(downloadId) {
  const ruleType = document.getElementById('rule-type').value;
  let rule = {};

  if (ruleType === 'domain') {
    rule = {
      type: 'domain',
      value: document.getElementById('domain-input').value,
      folder: document.getElementById('domain-folder').value
    };
  } else {
    const mapping = document.getElementById('filetype-mapping').value;
    if (mapping === 'folder') {
      rule = {
        type: 'extension',
        value: document.getElementById('current-filetype').textContent,
        folder: document.getElementById('filetype-folder').value
      };
    } else {
      const groupName = document.getElementById('group-select').value;
      rule = {
        type: 'group',
        value: document.getElementById('current-filetype').textContent,
        group: groupName
      };
    }
  }

  chrome.runtime.sendMessage({ action: 'addRule', rule }, (response) => {
    if (response.newPath) {
      document.getElementById('path').textContent = response.newPath;
    }
  });
}

function loadGroups() {
  chrome.runtime.sendMessage({ action: 'getGroups' }, (response) => {
    const groupSelect = document.getElementById('group-select');
    groupSelect.innerHTML = '';
    response.groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.name;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });
  });
}
