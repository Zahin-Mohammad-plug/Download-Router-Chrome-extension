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

  const tieBreaker = document.getElementById('tie-breaker').value;

  chrome.storage.sync.set({ rules, tieBreaker }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.sync.get(['rules', 'tieBreaker'], (data) => {
    const rules = data.rules || [];
    const tieBreaker = data.tieBreaker || 'domain';

    document.getElementById('tie-breaker').value = tieBreaker;
    const rulesContainer = document.getElementById('rules-container');
    rulesContainer.innerHTML = ''; // Clear existing rules

    rules.forEach(rule => {
      addRuleRow(rule.type, rule.value, rule.folder);
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

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save-options').addEventListener('click', saveOptions);
document.getElementById('add-rule').addEventListener('click', () => addRuleRow());
