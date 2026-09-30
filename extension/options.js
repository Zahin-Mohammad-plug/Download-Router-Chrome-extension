/**
 * Download Router — Settings page.
 *
 * One page listing where downloads go, in the order they're checked:
 * 1 Websites (rules type 'domain') → 2 File names ('contains') → 3 File types (groups + 'extension' rules)
 * → 4 Everything else (defaultFolder). Rows open a sheet to edit. See docs/DESIGN.md.
 */
(function () {
  'use strict';

  const V = self.DRValidation;
  const esc = V.escapeHTML;
  // No packaged companion release yet: send people to the install guide
  const RELEASES_URL = 'https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/blob/main/docs/COMPANION_INSTALL.md';
  const TIMEOUTS = [3000, 5000, 10000];
  const IS_MAC = /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
  const REVEAL_LABEL = IS_MAC ? 'Show in Finder' : 'Show in folder';

  // ---------- glyphs (16px line icons, 1.5px stroke, currentColor) ----------
  const LINE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const svg = (body, attrs = LINE) => `<svg viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;
  const GLYPHS = {
    web: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5M12 3.5C9.7 5.9 8.6 8.7 8.6 12s1.1 6.1 3.4 8.5"/>'),
    name: svg('<path d="M5 7V5.5h14V7M12 5.5v13M9.5 18.5h5"/>'),
    img: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.75"/><path d="M20.5 16l-4.5-4.5-8.5 8"/>'),
    doc: svg('<path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19M8.5 13h7M8.5 16.5h5"/>'),
    vid: svg('<rect x="3.5" y="6" width="12.5" height="12" rx="2.5"/><path d="M16 10.5l4.5-2.5v8L16 13.5"/>'),
    zip: svg('<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.25"/><path d="M5 9v9a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V9M10 12.5h4"/>'),
    '3d': svg('<path d="M20 16V8l-8-4.5L4 8v8l8 4.5z"/><path d="M4.3 7.8L12 12l7.7-4.2M12 12v8.5"/>'),
    app: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
    music: svg('<path d="M9 17.5V5.5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>'),
    else: svg('<path d="M12 4v10.5m0 0l-4-4m4 4l4-4"/><path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2"/>'),
    folder: `<svg class="fold-ico" viewBox="0 0 24 24" ${LINE} aria-hidden="true"><path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9.2v8.3A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>`,
    chev: '<svg class="chev" viewBox="0 0 7 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 1.5L5.5 6l-4 4.5"/></svg>',
    x: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1 1l8 8M9 1l-8 8"/></svg>',
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
    info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"')
  };
  const glyphFor = kind => GLYPHS[kind] || GLYPHS.else;
  // Neutral tile + line icon: color never encodes the kind (docs/DESIGN.md, principle 3)
  const tile = kind => `<span class="tile" data-kind="${kind}">${glyphFor(kind)}</span>`;

  // ---------- kinds (same icon for the same kind on every surface) ----------
  const EXT_KINDS = {
    img: 'jpg jpeg png gif bmp svg webp heic heif tif tiff avif ico raw',
    doc: 'pdf doc docx txt rtf odt md pages xls xlsx csv ppt pptx key numbers epub',
    vid: 'mp4 mov mkv avi wmv flv webm m4v mpg mpeg',
    zip: 'zip rar 7z tar gz bz2 xz tgz',
    '3d': 'stl obj 3mf step stp ply gcode fbx glb gltf blend',
    app: 'exe msi dmg deb rpm pkg apk appimage',
    music: 'mp3 wav flac aac m4a ogg aiff opus'
  };
  const EXT_TO_KIND = {};
  Object.entries(EXT_KINDS).forEach(([kind, list]) => list.split(' ').forEach(ext => { EXT_TO_KIND[ext] = kind; }));

  function kindForGroup(name, extensions) {
    const n = String(name).toLowerCase();
    if (/image|photo|picture/.test(n)) return 'img';
    if (/doc|pdf|text/.test(n)) return 'doc';
    if (/video|movie|film/.test(n)) return 'vid';
    if (/archive|zip|compress/.test(n)) return 'zip';
    if (/3d|model|print/.test(n)) return '3d';
    if (/software|app|install|program/.test(n)) return 'app';
    if (/music|audio|sound|song/.test(n)) return 'music';
    const first = splitList(extensions).find(ext => EXT_TO_KIND[ext]);
    return first ? EXT_TO_KIND[first] : 'else';
  }

  // ---------- helpers ----------
  function splitList(value) {
    return String(value || '').split(',').map(s => s.trim().replace(/^\.+/, '').toLowerCase()).filter(Boolean);
  }

  /** "3d-files" → "3D files", "documents" → "Documents" (display only; the key stays as stored) */
  function displayName(key) {
    return String(key || '').replace(/[-_]+/g, ' ').replace(/\b3d\b/i, '3D').replace(/^./, c => c.toUpperCase());
  }

  /** Names with “invoice” or “receipt” */
  function namesLabel(value) {
    const words = String(value || '').split(',').map(s => s.trim()).filter(Boolean).map(w => `“${w}”`);
    if (words.length <= 1) return `Names with ${words[0] || '…'}`;
    return `Names with ${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
  }

  function extensionsPreview(extensions) {
    const list = splitList(extensions);
    return list.slice(0, 4).join(', ') + (list.length > 4 ? '…' : '');
  }

  /** Short label for a stored folder; absolute paths show their last part */
  function folderLabel(folder) {
    if (!folder) return 'Downloads';
    if (V.isAbsolutePath(folder)) {
      const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean);
      return parts[parts.length - 1] || folder;
    }
    return folder;
  }

  function sendMessage(message, timeoutMs = 6000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      try {
        chrome.runtime.sendMessage(message, response => {
          clearTimeout(timer);
          resolve(chrome.runtime.lastError ? null : response);
        });
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  const $ = id => document.getElementById(id);

  // ---------- state ----------
  const state = {
    rules: [],
    groups: {},
    defaultFolder: 'Downloads',
    confirmationEnabled: true,
    confirmationTimeout: 5000,
    companion: false,
    sheetOpen: false
  };

  async function load() {
    const data = await chrome.storage.sync.get(['rules', 'groups', 'defaultFolder', 'confirmationEnabled', 'confirmationTimeout']);
    state.rules = Array.isArray(data.rules) ? data.rules.filter(r => r && typeof r === 'object') : [];
    state.groups = data.groups && typeof data.groups === 'object' ? data.groups : {};
    state.defaultFolder = data.defaultFolder || 'Downloads';
    state.confirmationEnabled = data.confirmationEnabled !== false;
    state.confirmationTimeout = nearestTimeout(data.confirmationTimeout);
  }

  function nearestTimeout(ms) {
    const value = Number(ms) || 5000;
    return TIMEOUTS.reduce((best, t) => Math.abs(t - value) < Math.abs(best - value) ? t : best, 5000);
  }

  async function saveSync(update, message) {
    try {
      await chrome.storage.sync.set(update);
      if (message) toast(message);
      return true;
    } catch (error) {
      console.error('Save failed:', error);
      toast(/quota/i.test(error.message || '')
        ? 'Couldn\'t save: too many rules for Chrome sync storage'
        : `Couldn't save: ${error.message}`, true);
      // Show what is actually stored, not the change that failed
      await load();
      if (!state.sheetOpen) render();
      return false;
    }
  }

  const saveRules = message => saveSync({ rules: state.rules }, message);
  const saveGroups = message => saveSync({ groups: state.groups }, message);

  // ---------- rendering ----------
  function rowHTML({ id, kind, title, sub, folder, off, control }) {
    const folderHTML = off
      ? '<span class="folder off">Off</span>'
      : `<span class="folder" title="${esc(folder)}"><span class="arrow" aria-hidden="true">→</span><span class="fname">${esc(folderLabel(folder))}</span></span>`;
    return `<div class="row${off ? ' off' : ''}" role="button" tabindex="0" data-id="${esc(id)}">
      ${tile(kind)}
      <div class="m"><span>${esc(title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      ${folderHTML}
      ${control || GLYPHS.chev}
    </div>`;
  }

  function emptyHTML(kind, text) {
    return `<div class="empty">${tile(kind)}<span>${esc(text)}</span></div>`;
  }

  function render() {
    const indexed = state.rules.map((rule, index) => ({ rule, index }));

    const sites = indexed.filter(x => x.rule.type === 'domain');
    $('websites-list').innerHTML = sites.length
      ? sites.map(({ rule, index }) => rowHTML({
          id: `rule:${index}`, kind: 'web', title: rule.value,
          sub: rule.value.includes('/') ? 'Only this part of the site' : '',
          folder: rule.folder, off: rule.enabled === false
        })).join('')
      : emptyHTML('web', 'Send downloads from a site, like github.com, to its own folder.');

    const names = indexed.filter(x => x.rule.type === 'contains');
    $('names-list').innerHTML = names.length
      ? names.map(({ rule, index }) => rowHTML({
          id: `rule:${index}`, kind: 'name', title: namesLabel(rule.value), folder: rule.folder, off: rule.enabled === false
        })).join('')
      : emptyHTML('name', 'Send files with a word in the name, like “invoice”, to a folder.');

    // Single-extension rules are checked before type groups, so they're listed first
    const extRules = indexed.filter(x => x.rule.type === 'extension');
    const typeRows = extRules.map(({ rule, index }) => {
      const exts = splitList(rule.value);
      return rowHTML({
        id: `rule:${index}`, kind: EXT_TO_KIND[exts[0]] || 'else',
        title: exts.map(e => `.${e}`).join(', ') + ' files', folder: rule.folder, off: rule.enabled === false
      });
    });
    Object.entries(state.groups).forEach(([key, group]) => {
      if (!group) return;
      const on = group.enabled !== false;
      typeRows.push(rowHTML({
        id: `group:${key}`, kind: kindForGroup(key, group.extensions), title: displayName(key),
        sub: extensionsPreview(group.extensions), folder: group.folder, off: !on,
        control: `<button class="switch sm" type="button" role="switch" aria-checked="${on}" aria-label="${esc(displayName(key))}" data-toggle="${esc(key)}"></button>`
      }));
    });
    $('types-list').innerHTML = typeRows.length
      ? typeRows.join('')
      : emptyHTML('else', 'Sort files by kind, like Images or Documents.');

    $('else-list').innerHTML = rowHTML({ id: 'default', kind: 'else', title: 'Anything that doesn\'t match', folder: state.defaultFolder });

    $('card-switch').setAttribute('aria-checked', String(state.confirmationEnabled));
    $('timeout-row').classList.toggle('disabled', !state.confirmationEnabled);
    document.querySelectorAll('#timeout-seg button').forEach(btn => {
      btn.setAttribute('aria-checked', String(Number(btn.dataset.ms) === state.confirmationTimeout));
    });
  }

  function renderCompanion() {
    const action = $('companion-action');
    $('companion-line').textContent = state.companion
      ? `Lets you save to any folder on your ${IS_MAC ? 'Mac' : 'computer'}, not just inside Downloads.`
      : `Optional. Lets you save to any folder on your ${IS_MAC ? 'Mac' : 'computer'}, not just inside Downloads.`;
    action.innerHTML = state.companion
      ? `<span class="installed">${GLYPHS.check}Installed</span>`
      : '<button class="btn secondary sm" id="get-app" type="button">Get the App</button>';
    const btn = $('get-app');
    if (btn) btn.addEventListener('click', () => chrome.tabs.create({ url: RELEASES_URL }));
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(message, isError = false) {
    const el = $('status');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 6000 : 2400);
  }

  // ---------- sheet ----------
  let sheet = null; // { kind: 'domain'|'contains'|'extension'|'group'|'default', original, isNew, enabled }
  let lastFocus = null;

  function fieldHTML({ id, label, value, placeholder, hint }) {
    return `<div class="field">
      <label for="${id}">${esc(label)}</label>
      <div class="field-row"><input class="input" id="${id}" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}" spellcheck="false" autocomplete="off"></div>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    </div>`;
  }

  function folderFieldHTML(folder) {
    const hint = state.companion
      ? 'A folder name inside Downloads, or choose any folder.'
      : 'A folder inside Downloads, like Receipts or Work/Invoices.';
    return `<div class="field">
      <label for="f-folder">Folder</label>
      <div class="field-row" id="folder-row">
        <span class="folder-input-ico">${GLYPHS.folder}</span>
        <input class="input folder-input" id="f-folder" value="${esc(folder || '')}" placeholder="Downloads" spellcheck="false" autocomplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="folder-menu">
        ${state.companion ? '<button class="btn secondary" type="button" id="f-choose">Choose…</button>' : ''}
      </div>
      <p class="hint" id="folder-hint">${esc(hint)}</p>
      <div class="note" id="fallback-note" hidden>${GLYPHS.info}<span></span></div>
    </div>`;
  }

  function openSheet(spec) {
    sheet = spec;
    const { kind, original, isNew } = spec;
    const icon = { domain: 'web', contains: 'name', default: 'else' }[kind]
      || (kind === 'group' ? kindForGroup(original ? original.key : '', original ? original.extensions : '') : EXT_TO_KIND[splitList(original && original.value)[0]] || 'else');

    let title;
    let fields = '';
    if (kind === 'domain') {
      title = isNew ? 'Add Website' : original.value;
      fields = fieldHTML({ id: 'f-match', label: 'Website', value: original && original.value, placeholder: 'github.com',
        hint: 'Also covers its subdomains. Add a path, like github.com/octocat, to narrow it.' });
    } else if (kind === 'contains') {
      title = isNew ? 'Add Name' : namesLabel(original.value);
      fields = fieldHTML({ id: 'f-match', label: 'Words in the file name', value: original && original.value, placeholder: 'invoice, receipt',
        hint: 'Separate words with commas. Any one of them is a match.' });
    } else if (kind === 'extension') {
      title = `${splitList(original.value).map(e => `.${e}`).join(', ')} files`;
      fields = fieldHTML({ id: 'f-match', label: 'Extension', value: original.value, placeholder: 'zip' });
    } else if (kind === 'group') {
      title = isNew ? 'Add Type' : displayName(original.key);
      fields = fieldHTML({ id: 'f-name', label: 'Name', value: original ? displayName(original.key) : '', placeholder: 'Fonts' })
        + fieldHTML({ id: 'f-exts', label: 'Extensions', value: original ? splitList(original.extensions).join(', ') : '', placeholder: 'ttf, otf, woff',
          hint: 'Separate extensions with commas.' });
    } else {
      title = 'Everything else';
    }

    const folder = original ? original.folder : (kind === 'default' ? state.defaultFolder : '');
    const toggle = (kind === 'domain' || kind === 'contains' || kind === 'extension') && original && original.enabled === false
      ? `<div class="toggle-row"><span id="on-label">On</span><button class="switch sm" type="button" role="switch" id="f-enabled" aria-checked="false" aria-labelledby="on-label"></button></div>`
      : '';
    const canDelete = !isNew && kind !== 'default';

    const form = $('sheet');
    form.innerHTML = `
      <h3 id="sheet-title">${tile(icon)}<span>${esc(title)}</span></h3>
      ${fields}
      ${folderFieldHTML(kind === 'default' ? state.defaultFolder : folder)}
      ${toggle}
      <p class="error" id="sheet-error" role="alert"></p>
      <div class="sheet-foot">
        ${canDelete ? '<button class="plain danger" type="button" id="f-delete">Delete</button>' : ''}
        <span class="spacer"></span>
        <button class="btn secondary" type="button" id="f-cancel">Cancel</button>
        <button class="btn primary" type="submit" id="f-save">${isNew ? 'Add' : 'Save'}</button>
      </div>`;

    spec.originalFolder = kind === 'default' ? state.defaultFolder : folder;
    lastFocus = document.activeElement;
    $('scrim').hidden = false;
    state.sheetOpen = true;

    const folderInput = $('f-folder');
    setupFolderAutocomplete(folderInput);
    folderInput.addEventListener('input', updateFallbackNote);
    updateFallbackNote();

    $('f-cancel').addEventListener('click', closeSheet);
    if (canDelete) $('f-delete').addEventListener('click', deleteCurrent);
    const enabledSwitch = $('f-enabled');
    if (enabledSwitch) enabledSwitch.addEventListener('click', () => {
      enabledSwitch.setAttribute('aria-checked', String(enabledSwitch.getAttribute('aria-checked') !== 'true'));
    });
    const choose = $('f-choose');
    if (choose) choose.addEventListener('click', async () => {
      const response = await sendMessage({ type: 'pickFolderNative', startPath: null }, 120000);
      if (response && response.success && response.path) {
        folderInput.value = response.path;
        updateFallbackNote();
      }
    });

    const first = form.querySelector('input');
    first.focus();
    first.select();
  }

  function closeSheet() {
    if (!state.sheetOpen) return;
    $('scrim').hidden = true;
    $('sheet').innerHTML = '';
    state.sheetOpen = false;
    sheet = null;
    if (pendingRender) { pendingRender = false; render(); }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function showError(message, inputId) {
    $('sheet-error').textContent = message;
    document.querySelectorAll('#sheet .input').forEach(i => i.classList.remove('invalid'));
    const input = inputId && $(inputId);
    if (input) { input.classList.add('invalid'); input.focus(); }
  }

  /** Absolute folders synced from a companion Mac stay allowed; say where files actually go here */
  function updateFallbackNote() {
    const note = $('fallback-note');
    if (!note || !sheet) return;
    const value = $('f-folder').value.trim();
    const show = !state.companion && V.isAbsolutePath(value) && value === sheet.originalFolder;
    note.hidden = !show;
    $('folder-hint').hidden = show;
    if (show) note.querySelector('span').textContent = `Files go to Downloads/${V.relativeFallbackFolder(value)} on this computer.`;
  }

  function validateFolderField() {
    const raw = $('f-folder').value.trim();
    const unchangedAbsolute = V.isAbsolutePath(raw) && raw === sheet.originalFolder;
    return V.validateFolder(raw, { companionInstalled: state.companion || unchangedAbsolute });
  }

  function ruleIndexOf(original) {
    if (!original) return -1;
    return state.rules.findIndex(r => r.type === original.type && r.value === original.value && r.folder === original.folder);
  }

  async function submitSheet() {
    if (!sheet) return;
    const { kind, original, isNew } = sheet;

    if (kind === 'default') {
      const folder = validateFolderField();
      if (folder.error) return showError(folder.error, 'f-folder');
      state.defaultFolder = folder.value;
      closeSheet();
      render();
      await saveSync({ defaultFolder: folder.value }, 'Saved');
      return;
    }

    if (kind === 'group') {
      const nameRaw = $('f-name').value.trim();
      if (!nameRaw) return showError('Give this file type a name.', 'f-name');
      const extensions = V.validateExtensions($('f-exts').value);
      if (extensions.error) return showError(extensions.error, 'f-exts');
      const folder = validateFolderField();
      if (folder.error) return showError(folder.error, 'f-folder');

      // Keep the stored key when the displayed name wasn't changed
      const key = original && nameRaw === displayName(original.key) ? original.key : nameRaw;
      const clash = Object.keys(state.groups).find(k => (!original || k !== original.key) &&
        (k.toLowerCase() === key.toLowerCase() || displayName(k).toLowerCase() === nameRaw.toLowerCase()));
      if (clash) return showError(`There's already a file type named “${displayName(clash)}”.`, 'f-name');

      const previous = original ? state.groups[original.key] || {} : {};
      const value = {
        ...previous,
        extensions: extensions.value,
        folder: folder.value,
        enabled: previous.enabled !== false,
        priority: 3,
        overrideDomainRules: false
      };
      // Rebuild to keep the position on rename
      const next = {};
      if (original && state.groups[original.key]) {
        Object.entries(state.groups).forEach(([k, g]) => { next[k === original.key ? key : k] = k === original.key ? value : g; });
      } else {
        Object.assign(next, state.groups, { [key]: value });
      }
      state.groups = next;
      closeSheet();
      render();
      await saveGroups(isNew ? `Added ${displayName(key)}` : 'Saved');
      return;
    }

    // domain / contains / extension rules
    const match = V.validateRuleValue(kind, $('f-match').value);
    if (match.error) return showError(match.error, 'f-match');
    const folder = validateFolderField();
    if (folder.error) return showError(folder.error, 'f-folder');

    const index = isNew ? -1 : ruleIndexOf(original);
    const duplicate = state.rules.some((r, i) => i !== index && r.type === kind &&
      String(r.value).toLowerCase() === match.value.toLowerCase());
    if (duplicate) {
      const what = kind === 'domain' ? `a rule for ${match.value}` : kind === 'contains' ? 'a rule for those words' : `a rule for .${match.value} files`;
      return showError(`There's already ${what}.`, 'f-match');
    }

    const enabledSwitch = $('f-enabled');
    const rule = {
      ...(index >= 0 ? state.rules[index] : {}),
      type: kind,
      value: match.value,
      folder: folder.value,
      enabled: enabledSwitch ? enabledSwitch.getAttribute('aria-checked') === 'true' : true,
      priority: 2
    };
    if (index >= 0) state.rules[index] = rule;
    else state.rules.push(rule);
    closeSheet();
    render();
    await saveRules(isNew ? 'Added' : 'Saved');
  }

  async function deleteCurrent() {
    if (!sheet) return;
    const { kind, original } = sheet;
    if (kind === 'group') {
      delete state.groups[original.key];
      closeSheet();
      render();
      await saveGroups(`Deleted ${displayName(original.key)}`);
      return;
    }
    const index = ruleIndexOf(original);
    if (index >= 0) state.rules.splice(index, 1);
    closeSheet();
    render();
    await saveRules('Deleted');
  }

  // ---------- folder autocomplete ----------
  let folderSuggestions = null;
  async function getSuggestions() {
    if (!folderSuggestions) {
      const response = await sendMessage({ type: 'getFolderSuggestions' });
      folderSuggestions = (response && response.folders) || [];
    }
    return folderSuggestions;
  }

  function setupFolderAutocomplete(input) {
    const row = $('folder-row');
    let menu = null;
    let items = [];
    let highlighted = -1;

    const close = () => {
      if (menu) menu.remove();
      menu = null;
      items = [];
      highlighted = -1;
      input.setAttribute('aria-expanded', 'false');
    };

    const choose = path => {
      input.value = path;
      close();
      updateFallbackNote();
      input.focus();
    };

    const paint = () => {
      if (!menu) return;
      menu.querySelectorAll('.mi').forEach((el, i) => el.classList.toggle('hl', i === highlighted));
      const current = menu.querySelectorAll('.mi')[highlighted];
      if (current) current.scrollIntoView({ block: 'nearest' });
    };

    const open = async () => {
      const all = await getSuggestions();
      if (document.activeElement !== input) return;
      const query = input.value.trim().toLowerCase();
      items = all.filter(f => f.path.toLowerCase() !== query && (!query || f.path.toLowerCase().includes(query))).slice(0, 8);
      if (!items.length) return close();
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'menu';
        menu.id = 'folder-menu';
        menu.setAttribute('role', 'listbox');
        row.appendChild(menu);
        input.setAttribute('aria-expanded', 'true');
      }
      highlighted = -1;
      menu.innerHTML = '<div class="mh">Folders you use</div>' + items.map((f, i) =>
        `<button type="button" class="mi" role="option" data-i="${i}" tabindex="-1">${GLYPHS.folder}<span class="p">${esc(f.path)}</span>${f.count > 0 ? `<span class="sub">${f.count} file${f.count === 1 ? '' : 's'}</span>` : ''}</button>`
      ).join('');
      menu.querySelectorAll('.mi').forEach(el => {
        el.addEventListener('mousedown', e => { e.preventDefault(); choose(items[Number(el.dataset.i)].path); });
      });
    };

    input.addEventListener('click', open);
    input.addEventListener('input', open);
    input.addEventListener('blur', () => setTimeout(close, 100));
    input.addEventListener('keydown', e => {
      if (!menu) {
        if (e.key === 'ArrowDown') { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(items.length - 1, highlighted + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(-1, highlighted - 1); paint(); }
      else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[highlighted].path); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
  }

  // ---------- row actions ----------
  function openFromRow(id) {
    if (id === 'default') return openSheet({ kind: 'default', original: null, isNew: false });
    if (id.startsWith('group:')) {
      const key = id.slice(6);
      const group = state.groups[key];
      if (group) openSheet({ kind: 'group', original: { key, extensions: group.extensions, folder: group.folder }, isNew: false });
      return;
    }
    const rule = state.rules[Number(id.slice(5))];
    if (rule) openSheet({ kind: rule.type, original: { ...rule }, isNew: false });
  }

  async function toggleGroup(key) {
    const group = state.groups[key];
    if (!group) return;
    group.enabled = group.enabled === false;
    render();
    await saveGroups(`${displayName(key)} ${group.enabled ? 'on' : 'off'}`);
  }

  async function saveCardSettings(message) {
    render();
    const ok = await saveSync({
      confirmationEnabled: state.confirmationEnabled,
      confirmationTimeout: state.confirmationTimeout
    }, message);
    if (!ok) return;
    // Let open download cards pick up the new countdown
    try {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'settingsChanged',
          confirmationEnabled: state.confirmationEnabled,
          confirmationTimeout: state.confirmationTimeout
        }).catch(() => {});
      });
    } catch (e) { /* no tabs to tell */ }
  }

  // ---------- welcome ----------
  async function setupWelcome() {
    const { showWelcome, rulesModelNotice } = await chrome.storage.local.get(['showWelcome', 'rulesModelNotice']);
    $('rules-notice').hidden = rulesModelNotice !== true;
    $('rules-notice-close').addEventListener('click', async () => {
      $('rules-notice').hidden = true;
      await chrome.storage.local.set({ rulesModelNotice: false });
    });
    $('welcome').hidden = !(showWelcome === true || location.hash === '#welcome');

    $('welcome-close').addEventListener('click', async () => {
      $('welcome').hidden = true;
      if (location.hash === '#welcome') history.replaceState(null, '', location.pathname);
      await chrome.storage.local.set({ showWelcome: false });
    });

    const tryBtn = $('welcome-try');
    const line = $('welcome-line');
    tryBtn.addEventListener('click', async () => {
      tryBtn.disabled = true;
      line.textContent = 'Downloading a small sample PDF…';
      try {
        const downloadId = await chrome.downloads.download({
          url: chrome.runtime.getURL('assets/download-router-sample.pdf'),
          conflictAction: 'uniquify'
        });
        const onChanged = delta => {
          if (delta.id !== downloadId || !delta.state) return;
          if (delta.state.current !== 'complete' && delta.state.current !== 'interrupted') return;
          chrome.downloads.onChanged.removeListener(onChanged);
          chrome.downloads.search({ id: downloadId }, ([item]) => {
            tryBtn.disabled = false;
            if (!item || item.state !== 'complete') {
              line.innerHTML = '<span class="err">The download didn\'t finish. Try again?</span>';
              return;
            }
            const parts = item.filename.replace(/\\/g, '/').split('/');
            const folder = parts.length > 1 ? parts[parts.length - 2] : 'Downloads';
            line.innerHTML = `<span class="done">${GLYPHS.check}<span>Saved to ${esc(folder)}</span><span aria-hidden="true">·</span><button class="plain" type="button" id="welcome-show">${REVEAL_LABEL}</button></span>`;
            $('welcome-show').addEventListener('click', () => chrome.downloads.show(downloadId));
          });
        };
        chrome.downloads.onChanged.addListener(onChanged);
      } catch (error) {
        tryBtn.disabled = false;
        line.innerHTML = `<span class="err">Couldn't start the download: ${esc(error.message)}</span>`;
      }
    });
  }

  // ---------- wiring ----------
  let pendingRender = false;

  function bind() {
    $('add-website').addEventListener('click', () => openSheet({ kind: 'domain', original: null, isNew: true }));
    $('add-name').addEventListener('click', () => openSheet({ kind: 'contains', original: null, isNew: true }));
    $('add-type').addEventListener('click', () => openSheet({ kind: 'group', original: null, isNew: true }));

    document.querySelector('.page').addEventListener('click', e => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) { e.stopPropagation(); toggleGroup(toggle.dataset.toggle); return; }
      const row = e.target.closest('.row[data-id]');
      if (row) openFromRow(row.dataset.id);
    });
    document.querySelector('.page').addEventListener('keydown', e => {
      const row = e.target.closest && e.target.closest('.row[data-id]');
      if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFromRow(row.dataset.id); }
    });

    $('card-switch').addEventListener('click', () => {
      state.confirmationEnabled = !state.confirmationEnabled;
      saveCardSettings(state.confirmationEnabled ? 'The card will show before saving' : 'Downloads save right away');
    });
    document.querySelectorAll('#timeout-seg button').forEach(btn => btn.addEventListener('click', () => {
      state.confirmationTimeout = Number(btn.dataset.ms);
      saveCardSettings(`Saves after ${btn.textContent}`);
    }));

    $('sheet').addEventListener('submit', e => { e.preventDefault(); submitSheet(); });
    $('sheet').addEventListener('input', () => {
      $('sheet-error').textContent = '';
      document.querySelectorAll('#sheet .input.invalid').forEach(i => i.classList.remove('invalid'));
    });
    $('scrim').addEventListener('mousedown', e => { if (e.target === $('scrim')) closeSheet(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.sheetOpen) { e.preventDefault(); closeSheet(); }
      // The sheet is modal: keep Tab / Shift+Tab inside it
      if (e.key === 'Tab' && state.sheetOpen) {
        const panel = document.getElementById('sheet');
        const focusable = panel ? [...panel.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter(el => !el.disabled && el.offsetParent !== null) : [];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Keep in step with rules added from the card or popup
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'sync') return;
      if (!['rules', 'groups', 'defaultFolder', 'confirmationEnabled', 'confirmationTimeout'].some(k => changes[k])) return;
      folderSuggestions = null;
      await load();
      if (state.sheetOpen) pendingRender = true;
      else render();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-glyph]').forEach(el => { el.innerHTML = GLYPHS[el.dataset.glyph] || ''; });
    bind();
    await load();
    render();
    renderCompanion();
    setupWelcome();
    const status = await sendMessage({ type: 'checkCompanionApp' });
    state.companion = !!(status && status.installed);
    renderCompanion();
  });
})();
