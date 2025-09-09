function saveOptions() {
  const rules = [];
  document.querySelectorAll('.rule').forEach(ruleEl => {
    const type = ruleEl.querySelector('.rule-type').value;
    const value = ruleEl.querySelector('.rule-value').value;
    const folder = ruleEl.querySelector('.rule-folder').value;
    if (value && folder) {
      rules.push({ type, value, folder });
    }
  });

  const groups = [];
  document.querySelectorAll('.group').forEach(groupEl => {
    const name = groupEl.querySelector('.group-name').value;
    const extensions = groupEl.querySelector('.group-extensions').value.split(',').map(ext => ext.trim());
    const folder = groupEl.querySelector('.group-folder').value;
    if (name && folder) {
      groups.push({ name, extensions, folder });
    }
  });

  const tieBreaker = document.getElementById('tie-breaker').value;
  const defaultPath = document.getElementById('default-path').value;

  chrome.storage.sync.set({ rules, groups, tieBreaker, defaultPath }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.sync.get(['rules', 'tieBreaker', 'groups', 'defaultPath'], (data) => {
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';
    const groups = data.groups || [];
    const defaultPath = data.defaultPath || '';

    document.getElementById('tie-breaker').value = tieBreaker;
    document.getElementById('default-path').value = defaultPath;
    const rulesContainer = document.getElementById('rules-container');
    rulesContainer.innerHTML = ''; // Clear existing rules

    rules.forEach(rule => {
      addRuleRow(rule.type, rule.value, rule.folder);
    });

    const groupsContainer = document.getElementById('groups-container');
    groupsContainer.innerHTML = '';

    groups.forEach(group => {
      addGroupRow(group.name, group.extensions.join(', '), group.folder);
    });
  });
}

function addRuleRow(type = 'domain', value = '', folder = '') {
  const rulesContainer = document.getElementById('rules-container');
  const ruleEl = document.createElement('div');
  ruleEl.classList.add('rule');

  ruleEl.innerHTML = `
    <select class="rule-type">
      <option value="domain" ${type === 'domain' ? 'selected' : ''}>Domain</option>
      <option value="extension" ${type === 'extension' ? 'selected' : ''}>Extension Group</option>
    </select>
    <input type="text" class="rule-value" placeholder="e.g., google.com or jpg,png,gif" value="${value}">
    <input type="text" class="rule-folder" placeholder="Folder Name" value="${folder}">
    <span class="delete-rule">X</span>
  `;

  ruleEl.querySelector('.delete-rule').addEventListener('click', () => {
    ruleEl.remove();
  });

  rulesContainer.appendChild(ruleEl);
}

function addGroupRow(name = '', extensions = '', folder = '') {
  const groupsContainer = document.getElementById('groups-container');
  const groupEl = document.createElement('div');
  groupEl.classList.add('group');

  groupEl.innerHTML = `
    <input type="text" class="group-name" placeholder="Group Name" value="${name}">
    <input type="text" class="group-extensions" placeholder="Extensions (comma separated)" value="${extensions}">
    <input type="text" class="group-folder" placeholder="Folder Name" value="${folder}">
    <span class="delete-group">X</span>
  `;

  groupEl.querySelector('.delete-group').addEventListener('click', () => {
    groupEl.remove();
  });

  groupsContainer.appendChild(groupEl);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save-options').addEventListener('click', saveOptions);
document.getElementById('add-rule').addEventListener('click', () => addRuleRow());
document.getElementById('add-group').addEventListener('click', () => addGroupRow());
