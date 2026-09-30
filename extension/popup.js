/**
 * popup.js - Toolbar popup for Download Router.
 *
 * Answers two questions (docs/DESIGN.md v3, "Popup"):
 *   - RECENT (grouped Today / Earlier): where did my recent downloads go? Clicking a row shows
 *     the file in Finder.
 *   - THIS SITE: where do downloads from the current website go? "Change" opens a folder menu
 *     (1–9 pick, typing filters) and saves a website rule.
 * Plus the sorting on/off switch, a weekly count and a link to Settings.
 *
 * Background messages used: getStats, getSiteRoute, getFolderSuggestions, addRule,
 * checkCompanionApp, pickFolderNative, openFolder.
 */

const V = self.DRValidation;
const esc = V.escapeHTML;
const RECENT_LIMIT = 6;
const IS_MAC = /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
const SHOW_LABEL = IS_MAC ? 'Show in Finder' : 'Show in folder';

const svg = (body, attrs = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;

// 1.5px line icons (DESIGN.md "Icons"); folders are outlines, the current one in accent
const FOLDER_PATH = '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>';
const FOLDER_ICON = svg(FOLDER_PATH);
const CHECK_ICON = svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"');
const NEW_FOLDER_ICON = svg(FOLDER_PATH + '<path d="M12 10.5v5M9.5 13h5"/>');
const OTHER_ICON = svg('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>', 'fill="currentColor"');
const SEARCH_ICON = svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"');

// Kind of file → neutral tile line icon (same kinds as the card and Settings; color is never used)
const KINDS = {
  img: { exts: 'jpg jpeg png gif bmp svg webp ico heic avif tif tiff', icon: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/>') },
  doc: { exts: 'pdf doc docx txt rtf odt md csv xls xlsx ppt pptx pages numbers key epub', icon: svg('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>') },
  vid: { exts: 'mp4 mov mkv avi wmv flv webm m4v', icon: svg('<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3z"/>') },
  music: { exts: 'mp3 wav flac aac m4a ogg aiff', icon: svg('<path d="M9 17.5V5.5l10.5-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>') },
  zip: { exts: 'zip rar 7z tar gz tgz bz2 xz', icon: svg('<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>') },
  '3d': { exts: 'stl obj 3mf step stp ply gcode', icon: svg('<path d="M20.5 16V8L12 3.5 3.5 8v8l8.5 4.5z"/><path d="M3.8 7.8L12 12l8.2-4.2M12 12v8.5"/>') },
  app: { exts: 'exe msi dmg deb rpm pkg apk appimage', icon: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 8.5h17M6.5 6.5h.01M9 6.5h.01"/>') },
  else: { exts: '', icon: svg('<path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M5 17.5v2h14v-2"/>') }
};
const KIND_BY_EXT = {};
for (const [kind, { exts }] of Object.entries(KINDS)) {
  exts.split(' ').filter(Boolean).forEach(ext => { KIND_BY_EXT[ext] = kind; });
}

const state = {
  enabled: true,
  stats: null,         // downloadStats (getStats response / storage)
  recent: [],
  url: null,           // active tab URL
  domain: null,        // host of the active tab without "www.", or null when it isn't a website
  route: null,         // getSiteRoute response
  companion: Promise.resolve(false)
};

const $ = (id) => document.getElementById(id);
const DAY = 86400000;

/* ---------------------------------------------------------------- helpers */

function kindOf(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || '');
  return (match && KIND_BY_EXT[match[1].toLowerCase()]) || 'else';
}

// "Code", "Finance › Invoices"; absolute folders (companion app) show their last part
function folderLabel(folder) {
  const relative = V.isAbsolutePath(folder) ? V.relativeFallbackFolder(folder) : folder;
  return String(relative || '').replace(/\\/g, '/').split('/').filter(Boolean).join(' › ') || 'Downloads';
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isToday = (timestamp) => startOfDay(new Date(timestamp)) === startOfDay(new Date());

function relativeTime(timestamp) {
  const then = new Date(timestamp);
  if (!timestamp || Number.isNaN(then.getTime())) return ''; // old or damaged history entry
  const now = new Date();
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days === 0) return `${Math.floor(minutes / 60)}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'short' });
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function siteHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function showToast(message) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 220);
  }, 2000);
}

/**
 * Footer count. Exact when background keeps per-day counts (downloadStats.dailyCounts,
 * { "YYYY-MM-DD": n } in local dates). Otherwise counted from recentActivity, which only keeps
 * the last 10 downloads: that is exact when the list reaches back past a week (or nothing was
 * ever dropped), and a lower bound otherwise ("recently").
 */
function weeklySummary(stats) {
  if (!stats) return '';
  const plural = (n) => `${n} ${n === 1 ? 'file' : 'files'}`;
  if (stats.dailyCounts && typeof stats.dailyCounts === 'object') {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      total += Number(stats.dailyCounts[localDateKey(day)]) || 0;
    }
    return total > 0 ? `Sorted ${plural(total)} this week` : '';
  }
  const recent = Array.isArray(stats.recentActivity) ? stats.recentActivity : [];
  const weekAgo = Date.now() - 7 * DAY;
  const count = recent.filter(entry => entry && entry.timestamp >= weekAgo).length;
  if (!count) return '';
  const complete = count < recent.length ||
    (typeof stats.totalDownloads === 'number' && stats.totalDownloads <= recent.length);
  return `Sorted ${plural(count)} ${complete ? 'this week' : 'recently'}`;
}

/* ---------------------------------------------------------------- sorting switch + footer */

function renderEnabled() {
  const toggle = $('toggle-extension-header');
  toggle.setAttribute('aria-checked', String(state.enabled));
  toggle.title = state.enabled ? 'Sorting is on' : 'Sorting is paused';
  $('paused-banner').hidden = state.enabled;
  renderFooter();
}

function renderFooter() {
  $('sorting-status').textContent = state.enabled ? weeklySummary(state.stats) : 'Sorting paused';
}

async function toggleEnabled() {
  state.enabled = !state.enabled;
  renderEnabled();
  await chrome.storage.sync.set({ extensionEnabled: state.enabled });
}

/* ---------------------------------------------------------------- recent */

function rowHTML(item, index) {
  const kind = kindOf(item.filename);
  const folder = folderLabel(item.folder);
  const time = relativeTime(item.timestamp);
  return `
    <button type="button" class="row" data-index="${index}" aria-label="${esc(`${item.filename}, in ${folder}, ${time}. ${SHOW_LABEL}`)}">
      <span class="tile t-${kind}" data-kind="${kind}" aria-hidden="true">${KINDS[kind].icon}</span>
      <span class="row-name" aria-hidden="true">${esc(item.filename)}</span>
      <span class="row-folder" aria-hidden="true"><span class="arrow">→</span>${esc(folder)}</span>
      <span class="row-end" aria-hidden="true"><span class="row-time">${esc(time)}</span><span class="reveal">${SHOW_LABEL}</span></span>
    </button>`;
}

function renderRecent() {
  const list = $('activity-list');
  const items = state.recent.slice(0, RECENT_LIMIT).map((item, index) => ({ item, index }));
  $('clear-activity').hidden = items.length === 0;

  if (!items.length) {
    $('recent-heading').textContent = 'Recent';
    list.innerHTML = '<div class="list"><p class="empty">Nothing yet. Download something and it\'ll show up here.</p></div>';
    return;
  }

  const groups = [
    { label: 'Today', rows: items.filter(({ item }) => isToday(item.timestamp)) },
    { label: 'Earlier', rows: items.filter(({ item }) => !isToday(item.timestamp)) }
  ].filter(group => group.rows.length);

  // The first group's label sits in the section head (next to Clear); later groups get their own
  $('recent-heading').textContent = groups[0].label;
  list.innerHTML = groups.map((group, i) => `
    ${i ? `<div class="section-head"><h2 class="section-label">${group.label}</h2></div>` : ''}
    <div class="list" role="group" aria-label="${group.label}" data-group="${group.label.toLowerCase()}">
      ${group.rows.map(({ item, index }) => rowHTML(item, index)).join('')}
    </div>`).join('');
}

/**
 * Shows a downloaded file in its folder. Chrome can do this itself, so it works without the
 * companion app; files moved by the companion app are opened through it.
 */
async function revealDownload(downloadId, filePath) {
  const [item] = downloadId ? await chrome.downloads.search({ id: downloadId }) : [];
  if (item && item.exists !== false && item.state === 'complete' &&
      (!filePath || !filePath.startsWith('/') || item.filename === filePath)) {
    chrome.downloads.show(downloadId);
    return;
  }
  if (filePath && V.isAbsolutePath(filePath)) {
    // Moved by the companion app after download: Chrome no longer knows where it is
    const response = await chrome.runtime.sendMessage({ type: 'openFolder', path: filePath, downloadId: null }).catch(() => null);
    if (response && response.success) return;
  }
  // File was deleted or moved outside Chrome: open the Downloads folder instead
  chrome.downloads.showDefaultFolder();
  showToast('That file has moved or been deleted');
}

async function clearRecent() {
  // Re-read so activity recorded since the popup opened isn't lost from the other stats
  const { downloadStats } = await chrome.storage.local.get(['downloadStats']);
  state.stats = { ...(downloadStats || {}), recentActivity: [] };
  await chrome.storage.local.set({ downloadStats: state.stats });
  state.recent = [];
  renderRecent();
  renderFooter();
}

/* ---------------------------------------------------------------- this site */

// The website value a rule from this popup is saved under: the matching rule's own value
// (so "github.com/octocat" or a parent domain is updated), otherwise the tab's host.
function ruleSite() {
  return state.route && state.route.kind === 'site' && state.route.rule ? state.route.rule.value : state.domain;
}

function renderSite() {
  const text = $('site-text');
  const change = $('site-change');
  change.hidden = !state.domain;

  if (!state.domain) {
    text.textContent = 'Open a website to set where its downloads go';
    return;
  }
  const site = `<span class="host">${esc(ruleSite())}</span>`;
  if (!state.route) {
    text.innerHTML = site;
  } else if (state.route.kind === 'type') {
    text.innerHTML = `${site} · sorted by file type`;
  } else {
    text.innerHTML = `${site}<span class="arrow"> → </span><b>${esc(folderLabel(state.route.folder))}</b>`;
  }
  change.setAttribute('aria-label', `Change where downloads from ${ruleSite()} go`);
}

async function loadSiteRoute(url) {
  state.route = await chrome.runtime.sendMessage({ type: 'getSiteRoute', url }).catch(() => null);
  renderSite();
}

async function setSiteFolder(folder) {
  closeMenu();
  const site = ruleSite();
  const response = await chrome.runtime.sendMessage({ type: 'addRule', rule: { type: 'domain', value: site, folder } })
    .catch(error => ({ success: false, error: error.message }));
  if (!response || !response.success) {
    showToast('Couldn\'t save that folder');
    return;
  }
  await loadSiteRoute(state.url);
  showToast(`${site} → ${folderLabel(folder)}`);
}

/* ---------------------------------------------------------------- folder menu */

const menu = $('folder-menu');
let menuFolders = [];
let menuFilter = '';
let menuCompanion = false;

function currentFolder() {
  const route = state.route;
  if (!route || route.kind === 'type') return null;
  return route.folder || 'Downloads';
}

// Folders matching the typed filter, in menu order, each with its index in menuFolders
function visibleFolders() {
  const query = menuFilter.toLowerCase();
  return menuFolders
    .map((folder, index) => ({ folder, index }))
    .filter(({ folder }) => !query || folderLabel(folder.path).toLowerCase().includes(query) ||
      folder.path.toLowerCase().includes(query));
}

function renderMenu() {
  const current = currentFolder();
  const folders = visibleFolders();
  // No check column when no folder is current (the site is sorted by file type)
  menu.classList.toggle('no-check', !current);
  const head = menuFilter
    ? `<span class="menu-filter" id="menu-filter">${SEARCH_ICON}<span>${esc(menuFilter)}</span></span><span>Esc clears</span>`
    : '<span>Folders you use</span><span>Type to filter</span>';
  menu.innerHTML = `
    <div class="menu-head">${head}</div>
    <div class="menu-scroll">
      ${folders.map(({ folder, index }, position) => {
        const selected = folder.path === current;
        const key = position < 9 ? String(position + 1) : '';
        return `
        <button type="button" class="mi" role="menuitemradio" aria-checked="${selected}" data-folder-index="${index}"${key ? ` aria-keyshortcuts="${key}"` : ''}>
          <span class="ck">${selected ? CHECK_ICON : ''}</span>
          ${FOLDER_ICON}<span class="name">${esc(folderLabel(folder.path))}</span>
          ${key ? `<span class="key" aria-hidden="true">${key}</span>` : ''}
        </button>`;
      }).join('')}
      ${folders.length ? '' : '<p class="menu-none">No folders match</p>'}
    </div>
    <div class="menu-sep" role="separator"></div>
    <button type="button" class="mi" role="menuitem" data-action="new"><span class="ck"></span>${NEW_FOLDER_ICON}<span class="name">New Folder…</span></button>
    ${menuCompanion ? `<button type="button" class="mi" role="menuitem" data-action="other"><span class="ck"></span>${OTHER_ICON}<span class="name">Other Location…</span></button>` : ''}`;
  positionMenu();
}

async function openMenu() {
  const [suggestions, companion] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getFolderSuggestions' }).catch(() => null),
    state.companion
  ]);
  menuCompanion = companion;
  menuFilter = '';
  menuFolders = ((suggestions && suggestions.folders) || []).filter(f => f && f.path);
  if (!menuFolders.length) menuFolders = [{ path: 'Downloads', count: 0 }];
  const current = currentFolder();
  if (current && !menuFolders.some(f => f.path === current)) menuFolders.unshift({ path: current, count: 0 });

  menu.hidden = false;
  $('site-change').setAttribute('aria-expanded', 'true');
  renderMenu();
  (menu.querySelector('.mi[aria-checked="true"]') || menu.querySelector('.mi')).focus();
}

// Opens above the Change button when it fits (the popup doesn't grow), otherwise below it,
// making the popup tall enough to show the whole menu.
function positionMenu() {
  document.body.style.minHeight = '';
  const anchor = $('site-change').getBoundingClientRect();
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(anchor.right + 4, document.body.clientWidth - 8) - menu.offsetWidth)}px`;
  if (anchor.top - 8 - height >= 8) {
    menu.style.top = `${anchor.top - 8 - height}px`;
    menu.dataset.above = '';
  } else {
    const top = anchor.bottom + 8;
    menu.style.top = `${top}px`;
    delete menu.dataset.above;
    document.body.style.minHeight = `${top + height + 8}px`;
  }
}

function closeMenu({ restoreFocus = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  menu.innerHTML = '';
  menuFilter = '';
  document.body.style.minHeight = '';
  $('site-change').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('site-change').focus();
}

function setMenuFilter(value) {
  menuFilter = value;
  renderMenu();
  (menu.querySelector('.mi[data-folder-index]') || menu.querySelector('.mi')).focus();
}

async function showNewFolderField() {
  const companion = await state.companion;
  const hint = `${companion ? 'A folder inside Downloads, or a full path.' : 'A folder inside Downloads.'} Press Return to use it.`;
  menu.innerHTML = `
    <form class="new-folder" novalidate>
      <label for="new-folder-input">New Folder</label>
      <div class="field">${FOLDER_ICON}<input id="new-folder-input" type="text" spellcheck="false" autocomplete="off" placeholder="Folder name" aria-describedby="new-folder-note"></div>
      <p class="hint" id="new-folder-note">${hint}</p>
    </form>`;
  positionMenu();
  const input = $('new-folder-input');
  const note = $('new-folder-note');
  input.focus();

  input.addEventListener('input', (event) => {
    note.className = 'hint';
    note.textContent = hint;
    // Inline autocomplete from folders you use: complete the rest and select it
    if (!event.inputType || !event.inputType.startsWith('insert') || input.selectionEnd !== input.value.length) return;
    const typed = input.value;
    const match = typed && menuFolders.map(f => f.path).find(path => path.length > typed.length && path.toLowerCase().startsWith(typed.toLowerCase()));
    if (match) {
      input.value = typed + match.slice(typed.length);
      input.setSelectionRange(typed.length, match.length);
    }
  });

  menu.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const result = V.validateFolder(input.value, { companionInstalled: companion, allowEmpty: false });
    if (result.error) {
      note.className = 'error';
      note.textContent = result.error;
      input.focus();
      return;
    }
    setSiteFolder(result.value);
  });
}

async function pickOtherLocation() {
  closeMenu();
  // The native picker takes focus and closes this popup, so background saves the rule itself
  const response = await chrome.runtime.sendMessage({
    type: 'pickFolderNative',
    thenAddRule: { type: 'domain', value: ruleSite() }
  }).catch(() => null);
  if (response && response.success && response.path) {
    await loadSiteRoute(state.url);
    showToast(`${ruleSite()} → ${folderLabel(response.path)}`);
  }
}

function pickFolder(folder) {
  if (!folder) return;
  if (state.route && state.route.kind === 'site' && folder.path === state.route.folder) {
    closeMenu({ restoreFocus: true });
    return;
  }
  setSiteFolder(folder.path);
}

function onMenuClick(event) {
  const item = event.target.closest('.mi');
  if (!item) return;
  if (item.dataset.action === 'new') return showNewFolderField();
  if (item.dataset.action === 'other') return pickOtherLocation();
  pickFolder(menuFolders[Number(item.dataset.folderIndex)]);
}

function onMenuKeydown(event) {
  const inField = event.target.closest('.new-folder');
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!inField && menuFilter) setMenuFilter('');
    else closeMenu({ restoreFocus: true });
    return;
  }
  if (inField || event.metaKey || event.ctrlKey || event.altKey) return;

  // 1–9 pick the numbered folder
  if (/^[1-9]$/.test(event.key)) {
    const match = visibleFolders()[Number(event.key) - 1];
    if (match) {
      event.preventDefault();
      pickFolder(match.folder);
    }
    return;
  }
  // Typing filters the folder list (a space only counts once a filter has started)
  if (event.key.length === 1 && (event.key !== ' ' || menuFilter)) {
    event.preventDefault();
    setMenuFilter(menuFilter + event.key);
    return;
  }
  if (event.key === 'Backspace' && menuFilter) {
    event.preventDefault();
    setMenuFilter(menuFilter.slice(0, -1));
    return;
  }

  const items = [...menu.querySelectorAll('.mi')];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  let next = null;
  if (event.key === 'ArrowDown') next = (index + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  if (next === null) return;
  event.preventDefault();
  items[next].focus();
}

/* ---------------------------------------------------------------- setup */

function applyStats(stats) {
  state.stats = stats || null;
  state.recent = (stats && stats.recentActivity) || [];
  renderRecent();
  renderFooter();
}

function bindEvents() {
  $('toggle-extension-header').addEventListener('click', toggleEnabled);
  $('clear-activity').addEventListener('click', clearRecent);
  $('open-options-header').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $('activity-list').addEventListener('click', (event) => {
    const row = event.target.closest('.row');
    const item = row && state.recent[Number(row.dataset.index)];
    if (item) revealDownload(item.downloadId, item.filePath);
  });

  $('site-change').addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener('click', onMenuClick);
  menu.addEventListener('keydown', onMenuKeydown);
  // The pointer and the keyboard share one highlight, like a native menu
  menu.addEventListener('mousemove', (event) => {
    const item = event.target.closest('.mi');
    if (item && document.activeElement !== item) item.focus({ preventScroll: true });
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !$('site-change').contains(event.target)) closeMenu();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.downloadStats) applyStats(changes.downloadStats.newValue);
    if (area === 'sync' && changes.extensionEnabled) {
      state.enabled = changes.extensionEnabled.newValue !== false;
      renderEnabled();
    }
  });
}

async function init() {
  bindEvents();
  state.companion = chrome.runtime.sendMessage({ type: 'checkCompanionApp' })
    .then(status => !!(status && status.installed)).catch(() => false);

  const [{ extensionEnabled }, stats, [tab]] = await Promise.all([
    chrome.storage.sync.get(['extensionEnabled']),
    chrome.runtime.sendMessage({ type: 'getStats' }).catch(() => null),
    chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
  ]);

  state.enabled = extensionEnabled !== false;
  state.url = tab && tab.url;
  state.domain = siteHost(state.url);
  applyStats(stats);
  renderEnabled();
  renderSite();
  if (state.domain) await loadSiteRoute(state.url);
}

init();
