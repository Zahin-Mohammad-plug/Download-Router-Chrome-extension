/**
 * content.js
 *
 * Purpose: Content script for the Download Router Chrome extension.
 * Role: Shows the download card, a small, nearly opaque card in the bottom-right corner of the
 *       page that says where a download is going and lets the user send it somewhere else.
 *
 * The card answers one question: "Where is this going, and how do I make it go somewhere else?"
 * - Destination first: "Saving to" + the folder button (the headline). It opens a menu of the
 *   folders the user already uses (1–9 pick, typing filters), plus "New Folder…",
 *   "Rename File…" and (with the companion app) "Other Location…".
 * - One way to make it stick: the "Always save … here" row, shown once the folder was changed.
 * - "Why here?" explains the rule chain step that decided.
 * - Save or ✕ (cancel). Doing nothing saves when the hairline along the bottom runs out.
 *
 * Architecture:
 * - Closed Shadow DOM for style isolation from the website
 * - Talks to background.js through chrome.runtime messaging (this.sendMessage wrapper)
 * - Wrapped in an IIFE so background.js can re-inject it after install/update
 */

// Everything is wrapped in an IIFE so re-injecting this file into the same isolated world
// (background.js does this after install/update) doesn't throw "Identifier has already been declared"
(() => {

/* ------------------------------------------------------------------------------------------
 * Path helpers (mirror the ones in background.js so paths are built identically)
 * ------------------------------------------------------------------------------------------ */

/**
 * Returns true for real absolute paths (C:\, UNC shares, or Unix system roots).
 * A typed "/Videos" is treated as the relative "Videos" subfolder of Downloads.
 * Mirrors isAbsolutePath in background.js.
 */
function isAbsolutePath(path) {
  if (!path) return false;
  // Windows drive letter (C:\) or UNC share (\\server\share)
  if (/^([A-Za-z]:[\\\/]|\\\\[^\\])/.test(path)) return true;
  return /^\/(Users|Volumes|home|mnt|media|tmp|private|opt|var|srv|run|Applications|Library|System)(\/|$)/.test(path);
}

/**
 * Escapes a string for safe insertion into innerHTML (text and attribute values).
 * Filenames, folders, rule values, and domains are untrusted page/user data.
 */
function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extracts just the filename from a potentially path-containing string.
 */
function extractFilename(path) {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop();
}

/**
 * Normalizes a folder path by converting backslashes to forward slashes
 * and removing leading/trailing slashes.
 */
function normalizePath(path) {
  if (!path || path.trim() === '') return '';
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

/**
 * Sanitizes folder name by removing invalid characters.
 */
function sanitizeFolderName(folder) {
  if (!folder) return '';
  return folder
    .replace(/[<>:"|?*\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/^\.+$/, '')
    .trim();
}

/**
 * Builds a valid relative path for Chrome downloads API.
 */
function buildRelativePath(folder, filename) {
  const cleanFolder = normalizePath(folder);
  const cleanFilename = extractFilename(filename);

  // "Downloads" means the Downloads root; "Downloads/Videos" means Downloads/Videos (mirrors background.js)
  const withoutRoot = cleanFolder.replace(/^downloads(\/|$)/i, '');
  if (!withoutRoot) {
    return cleanFilename;
  }

  const folderSegments = withoutRoot.split('/')
    .map(segment => sanitizeFolderName(segment))
    .filter(segment => segment.length > 0);

  if (folderSegments.length === 0) {
    return cleanFilename;
  }

  return `${folderSegments.join('/')}/${cleanFilename}`;
}

/**
 * Folder part of a relative download path ("Code/app.zip" → "Code", "app.zip" → "Downloads").
 */
function folderOfRelativePath(relativePath) {
  const parts = normalizePath(String(relativePath || '')).split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Downloads';
}

/**
 * Short display name of a folder: the last path segment ("Projects/Boats" → "Boats").
 */
function folderDisplayName(folder) {
  if (!folder) return 'Downloads';
  const parts = String(folder).replace(/\\/g, '/').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || 'Downloads';
  return /^[A-Za-z]:$/.test(last) ? last + '\\' : last;
}

/**
 * Validates a folder typed into "New Folder…". Uses the shared validator (lib/validation.js)
 * when it's loaded, and an equivalent local check otherwise (e.g. content.js re-injected alone).
 * Returns { value } or { error }.
 */
function validateFolderInput(folder, companionInstalled) {
  const shared = self.DRValidation && self.DRValidation.validateFolder;
  if (shared) return shared(folder, { companionInstalled, allowEmpty: false });
  const raw = String(folder || '').trim();
  if (!raw) return { error: 'Choose a destination folder.' };
  if (/^downloads\/?$/i.test(raw)) return { value: 'Downloads' };
  if (isAbsolutePath(raw)) {
    return companionInstalled ? { value: raw } : { error: 'Folders outside Downloads need the companion app. Use a folder name like "Invoices" instead.' };
  }
  const cleaned = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/').replace(/^downloads\//i, '');
  if (/[<>:"|?*\x00-\x1f]/.test(cleaned)) return { error: 'Folder names can\'t contain < > : " | ? * characters.' };
  if (cleaned.split('/').some(s => s.trim() === '..' || s.trim() === '.')) return { error: 'Folder names can\'t be "." or "..".' };
  return { value: cleaned || 'Downloads' };
}

/**
 * Validates a new file name typed into "Rename File…". Returns { value } or { error }.
 */
function validateFilenameInput(name) {
  const value = String(name || '').trim();
  if (!value) return { error: 'Enter a file name.' };
  if (/[\/\\<>:"|?*\x00-\x1f]/.test(value)) return { error: 'File names can\'t contain / \\ < > : " | ? * characters.' };
  if (/^\.+$/.test(value)) return { error: 'Enter a file name.' };
  return { value };
}

/**
 * Registrable ("base") domain: "gist.github.com" → "github.com", "www.bbc.co.uk" → "bbc.co.uk".
 * Returns '' when the download has no usable domain.
 */
function getBaseDomain(domain) {
  if (!domain || domain === 'unknown') return '';
  const host = String(domain).replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^www\./i, '').toLowerCase();
  if (!host) return '';
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || !host.includes('.')) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const secondLevel = labels[labels.length - 2];
  const tld = labels[labels.length - 1];
  // Two-part public suffixes like co.uk, com.au, co.jp
  const twoPart = tld.length === 2 && /^(co|com|net|org|gov|edu|ac|ne|or|go)$/.test(secondLevel);
  return labels.slice(twoPart ? -3 : -2).join('.');
}

/* ------------------------------------------------------------------------------------------
 * File kinds: neutral tile + line glyph + short type label (ZIP, PDF). Color never encodes kind.
 * ------------------------------------------------------------------------------------------ */

const FILE_KINDS = {
  img: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'heif', 'tif', 'tiff', 'avif', 'raw'],
  doc: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'key', 'numbers', 'epub'],
  vid: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'],
  music: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'aiff', 'opus'],
  zip: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'],
  '3d': ['stl', 'obj', '3mf', 'step', 'stp', 'ply', 'gcode', 'fbx', 'blend'],
  app: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'app']
};

function fileKind(extension) {
  const ext = String(extension || '').toLowerCase();
  for (const [kind, list] of Object.entries(FILE_KINDS)) {
    if (list.includes(ext)) return kind;
  }
  return 'else';
}

/**
 * Short uppercase type label for the file tile ("zip" → "ZIP", "appimage" → "APPI").
 */
function typeLabel(extension) {
  return String(extension || '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
}

// Line icons: 24-unit grid, drawn with a true 1.5px stroke at any size (non-scaling stroke)
const svgLine = (body, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body.replace(/<(path|rect|circle)/g, '<$1 vector-effect="non-scaling-stroke"')}</svg>`;

const ICONS = {
  img: svgLine('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>'),
  doc: svgLine('<path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5z"/><path d="M13.5 3.5v6h6"/><path d="M8.5 13.5h7M8.5 17h4.5"/>'),
  vid: svgLine('<rect x="3.5" y="5.5" width="13" height="13" rx="2.5"/><path d="M16.5 10.5l4-2.2v7.4l-4-2.2"/>'),
  music: svgLine('<path d="M9 17.5V6.5l10.5-2v11"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>'),
  zip: svgLine('<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M12 3.5v2M12 7.5v2M12 11.5v2"/><rect x="10.5" y="15" width="3" height="2.5" rx=".8"/>'),
  '3d': svgLine('<path d="M20 16V8l-8-4.5L4 8v8l8 4.5z"/><path d="M4.3 7.8L12 12l7.7-4.2M12 12v8.5"/>'),
  app: svgLine('<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M12 8v7.5m0 0l-3-3m3 3l3-3"/>'),
  else: svgLine('<path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5z"/><path d="M13.5 3.5v6h6"/>'),
  ok: svgLine('<path d="M5.5 12.5l4 4 9-9.5"/>', 'res-ico'),
  err: svgLine('<path d="M12 7.5v6"/><path d="M12 16.8v.2"/><circle cx="12" cy="12" r="8.5"/>', 'res-ico'),
  folder: svgLine('<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9.2V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z"/>', 'fold-ico'),
  search: svgLine('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>', 'search-ico'),
  chevron: '<svg class="chev" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 4l3 3 3-3"/></svg>',
  close: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>',
  check: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 5.2l2 2L8 3"/></svg>'
};

// How long the file → folder save motion takes
const SAVE_MOTION_MS = 180;

/**
 * DownloadOverlay class
 * Shows the download card for one pending download at a time.
 */
class DownloadOverlay {
  constructor() {
    // Shadow DOM root element (isolated styling)
    this.shadowRoot = null;
    this.shadowHost = null;
    // The card's .overlay-container element
    this.currentOverlay = null;
    // Pending download shown on the card (shared shape with background.js)
    this.currentDownloadInfo = null;
    // Countdown
    this.countdownTimer = null;
    this.countdownPaused = false;
    this.countdownEnabled = true;
    this.configuredTimeoutSeconds = 5;
    this.countdownTotal = 5000;
    this.timeLeft = 5000;
    // Set once saveDownload has started (prevents double-save)
    this.saving = false;
    // Path Chrome already saved the file to (its ~15s limit), or null
    this.savedEarlyPath = null;
    // Pointer/focus engagement - the countdown pauses while the user is engaged with the card
    this.pointerInside = false;
    this.focusInside = false;
    // True while the user moves around with Tab (keyboard focus holds the countdown), false
    // after a pointer press (a button left focused by a click doesn't)
    this.keyboardNav = false;
    this.resetCardState();
    this.init();
  }

  /**
   * Per-download UI state (menu, inline fields, remember row).
   */
  resetCardState() {
    this.menuOpen = false;
    this.menuMode = 'list'; // 'list' | 'new-folder'
    this.menuIndex = -1;
    this.menuFilter = ''; // type-to-filter text in the folder menu
    this.whyOpen = false; // "Why here?" explainer expanded
    this.renameOpen = false;
    this.nativePickerOpen = false;
    this.reloading = false;
    this.folderSuggestions = [];
    this.originalFolder = 'Downloads';
    this.originalFilename = '';
    this.rememberChecked = false;
    this.rememberScope = 'site'; // 'site' | 'type'
    this.companionInstalled = false;
  }

  /**
   * Listens for messages from the background script.
   */
  init() {
    this.navKeyHandler = (e) => { if (e.key === 'Tab') this.keyboardNav = true; };
    this.navPointerHandler = () => { this.keyboardNav = false; };
    window.addEventListener('keydown', this.navKeyHandler, true);
    window.addEventListener('pointerdown', this.navPointerHandler, true);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // A newer copy of this script replaced this instance - ignore everything
      if (this.destroyed) return;
      const isCurrent = (id) => !!(this.currentDownloadInfo && this.currentDownloadInfo.id === id);

      if (message.type === 'showDownloadOverlay') {
        this.showDownloadOverlay(message.downloadInfo, message.confirmationTimeout, message.confirmationEnabled);
      } else if (message.type === 'checkEditorState') {
        // Background's auto-save timer asks before saving: never while a menu/field is open
        const current = !message.downloadId || isCurrent(message.downloadId);
        sendResponse({ hasEditor: !!current && this.hasOpenEditor(), countdownPaused: this.countdownPaused });
        return true;
      } else if (message.type === 'downloadSavedEarly') {
        // Chrome only waits ~15s, so background saved this download while the user was still
        // choosing. Keep the card open: Save moves the file to their choice afterwards.
        if (isCurrent(message.downloadId) && !this.saving) {
          this.handleSavedEarly(message.savedPath || '');
        }
        sendResponse({ success: true });
        return true;
      } else if (message.type === 'closeOverlay') {
        // Background saved it (timer). If the card is mid-save it shows its own result instead.
        if (isCurrent(message.downloadId) && !this.saving) {
          this.cleanup(message.downloadId);
        }
        sendResponse({ success: true });
        return true;
      } else if (message.type === 'settingsChanged') {
        // Timeout changed in settings - restart the live countdown with the new duration
        if (this.currentDownloadInfo && !this.saving && message.confirmationTimeout) {
          this.configuredTimeoutSeconds = Math.max(1, Math.floor(message.confirmationTimeout / 1000));
          this.countdownTotal = this.configuredTimeoutSeconds * 1000;
          this.timeLeft = this.countdownTotal;
          if (this.countdownTimer) this.startTicking();
          this.updateProgress();
        }
        sendResponse({ success: true });
        return true;
      } else if (message.type === 'rulesUpdated' || message.type === 'reloadRulesForDownload') {
        if (isCurrent(message.downloadId)) {
          this.reloadRulesAndUpdateOverlay();
        }
        sendResponse({ success: true });
        return true;
      } else if (message.type === 'rulesChanged') {
        if (this.currentDownloadInfo) {
          // Small delay to ensure storage has been updated
          setTimeout(() => this.reloadRulesAndUpdateOverlay(), 100);
        }
        sendResponse({ success: true });
        return true;
      }
    });
  }

  /* ----------------------------------------------------------------------------------------
   * Shadow DOM + styles
   * ---------------------------------------------------------------------------------------- */

  /**
   * Creates the closed Shadow DOM host (fixed, full-viewport, click-through) and injects CSS.
   */
  createShadowDOM() {
    // A custom tag and "all: initial" keep page rules like "div { filter: invert(1) !important }"
    // or "body > * { transform: scale(1.5) !important }" off the card (inline !important wins)
    const host = document.createElement('download-router-card');
    host.id = 'download-router-shadow-host';
    host.style.cssText = `
      all: initial !important;
      display: block !important;
      position: fixed !important;
      filter: none !important;
      transform: none !important;
      opacity: 1 !important;
      visibility: visible !important;
      clip-path: none !important;
      mask: none !important;
      margin: 0 !important;
      padding: 0 !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
    `;

    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    this.shadowHost = host;

    // Prevent keyboard events from bubbling to the page, so typing in the card doesn't trigger
    // page shortcuts. Bubble phase on the shadow root (not capture on the host) so handlers
    // inside the card (menu arrows, Enter, Escape) still run first.
    ['keydown', 'keyup', 'keypress'].forEach((type) => {
      this.shadowRoot.addEventListener(type, (e) => e.stopPropagation());
    });

    // Close the folder menu when clicking elsewhere in the card...
    this.shadowRoot.addEventListener('click', (e) => {
      if (this.menuOpen && !e.target.closest('.folder-menu') && !e.target.closest('.folder-btn')) {
        this.closeMenu(false);
      }
    });
    // ...or on the page
    this.documentClickHandler = (e) => {
      if (this.menuOpen && !e.composedPath().includes(host)) {
        this.closeMenu(false);
      }
    };
    document.addEventListener('click', this.documentClickHandler, true);

    const style = document.createElement('style');
    style.textContent = this.getCSS();
    this.shadowRoot.appendChild(style);

    document.body.appendChild(host);
    return this.shadowRoot;
  }

  /**
   * Stylesheet for the card (v3 "Calm Utility", see docs/DESIGN.md: tokens, card, menu).
   */
  getCSS() {
    return `
      :host { all: initial; }
      :host {
        --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
        --accent: #0E7C74;
        --accent-hover: #0B6A63;
        --accent-ink: #FFFFFF;
        --accent-soft: rgba(14,124,116,.12);
        --bg: #F6F5F2;
        --surface: #FFFFFF;
        --surface-2: #F1F0EC;
        --hairline: rgba(28,25,20,.10);
        --hairline-strong: rgba(28,25,20,.14);
        --label: #1C1B18;
        --secondary: #5E5B54;
        --tertiary: #8C897F;
        --danger: #C4372B;
        --success: #1E8E4E;
        --tile: #F1F0EC;
        --shadow: 0 8px 28px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08);
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --accent: #2AB3A6;
          --accent-hover: #43C4B7;
          --accent-ink: #04211E;
          --accent-soft: rgba(42,179,166,.20);
          --bg: #161615;
          --surface: #1F1F1D;
          --surface-2: #2A2A27;
          --hairline: rgba(255,255,255,.09);
          --hairline-strong: rgba(255,255,255,.14);
          --label: #F2F1ED;
          --secondary: #A8A59D;
          --tertiary: #77746C;
          --danger: #FF6B5E;
          --success: #4CC77F;
          --tile: #2A2A27;
          --shadow: 0 8px 28px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.3);
        }
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      button, input { font: inherit; color: inherit; letter-spacing: inherit; }
      button { background: none; border: 0; cursor: pointer; -webkit-appearance: none; appearance: none; text-align: inherit; }
      button:focus, input:focus { outline: none; }
      button:focus-visible, input[type="checkbox"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      svg { display: block; }

      /* The dialog is a transparent positioning box; the surface lives on .card and the menu
         is its sibling (so the menu's blur sees the page, and the card needs no blur) */
      .overlay-container {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 344px;
        max-width: calc(100vw - 24px);
        pointer-events: auto;
        font: 400 13px/18px var(--font);
        color: var(--label);
        -webkit-font-smoothing: antialiased;
        text-align: left;
        letter-spacing: normal;
        animation: dr-enter 200ms cubic-bezier(.2,.8,.2,1);
      }
      @media (max-width: 400px) {
        .overlay-container { right: 12px; bottom: 12px; }
      }
      @keyframes dr-enter {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: none; }
      }
      .overlay-container.leaving { opacity: 0; transform: translateY(4px); transition: opacity 160ms ease-in, transform 160ms ease-in; }

      .card {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        padding: 14px 16px 14px;
        background: var(--surface);
        background: color-mix(in srgb, var(--surface) 97%, transparent);
        border: 1px solid var(--hairline-strong);
        box-shadow: var(--shadow);
      }

      /* Row 1: "Saving to" + folder button (the headline), ✕ */
      .overlay-header { display: grid; grid-template-columns: minmax(0, 1fr) 24px; column-gap: 8px; align-items: start; }
      .dest { min-width: 0; }
      .dest-label { display: block; font-size: 11.5px; line-height: 15px; color: var(--secondary); margin-bottom: 2px; }
      .folder-btn {
        display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: calc(100% + 8px);
        height: 32px; padding: 0 8px; margin-left: -8px; border-radius: 8px;
        font-size: 15px; line-height: 20px; font-weight: 600; color: var(--label);
        border: 1px solid transparent;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .folder-btn:hover, .folder-btn[aria-expanded="true"] { background: var(--surface-2); }
      .folder-btn:focus-visible { border-color: var(--hairline-strong); }
      .folder-btn .folder-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .folder-btn .fold-ico { width: 18px; height: 18px; flex: none; color: var(--accent); }
      .folder-btn .chev { width: 10px; height: 10px; flex: none; color: var(--secondary); margin-left: 1px; }
      .folder-path { font-size: 11.5px; line-height: 15px; color: var(--secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
      .folder-path[hidden] { display: none; }
      .folder-path .sep { color: var(--tertiary); padding: 0 3px; }
      .cancel-download-btn {
        width: 24px; height: 24px; border-radius: 6px; margin-top: -2px; margin-right: -4px;
        display: grid; place-items: center; color: var(--tertiary);
        transition: background-color 150ms ease-out, color 150ms ease-out;
      }
      .cancel-download-btn svg { width: 10px; height: 10px; }
      .cancel-download-btn:hover { background: var(--surface-2); color: var(--label); }

      /* Row 2: file tile, name (middle ellipsis), size · site */
      .file-row { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: center; margin-top: 12px; }
      .tile {
        width: 36px; height: 36px; border-radius: 8px; flex: none;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        background: var(--tile); color: var(--secondary);
      }
      .tile svg { width: 16px; height: 16px; }
      .tile.has-type svg { width: 15px; height: 15px; }
      .tile .type { font-size: 10.5px; line-height: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--secondary); }
      .file-row.flying .tile {
        transition: transform ${SAVE_MOTION_MS}ms cubic-bezier(.4,0,.8,.6), opacity ${SAVE_MOTION_MS}ms ease-in;
      }
      .name-col { min-width: 0; }
      .filename { display: flex; min-width: 0; font-size: 13px; line-height: 18px; font-weight: 400; white-space: nowrap; }
      .filename .fn-head { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .filename .fn-tail { flex: none; }
      .meta { font-size: 11.5px; line-height: 15px; color: var(--secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

      /* Inline fields (rename replaces the filename; new folder lives in the menu) */
      .rename-input, .new-folder-input {
        width: 100%; height: 28px; padding: 0 8px; border-radius: 8px;
        font-size: 13px; font-weight: 400; color: var(--label);
        background: var(--surface-2); border: 1px solid var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft); outline: none;
      }
      .rename-input { margin: -5px 0 -5px -9px; width: calc(100% + 9px); }
      .rename-input::placeholder, .new-folder-input::placeholder { color: var(--tertiary); }
      .filename-edit { min-width: 0; }
      .filename-edit + .meta { margin-top: 5px; }
      .field-error { font-size: 11.5px; line-height: 15px; color: var(--danger); margin-top: 7px; }
      .field-error:empty { display: none; }
      .rename-input.invalid, .new-folder-input.invalid { border-color: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent); }

      /* Remember row: plain checkbox + sentence, top hairline, no tint */
      .remember-row {
        margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--hairline);
        display: flex; align-items: flex-start; gap: 9px;
        font-size: 13px; line-height: 18px; color: var(--label);
        cursor: pointer; animation: dr-fade 180ms ease-out;
      }
      .remember-row[hidden] { display: none; }
      @keyframes dr-fade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
      .remember-checkbox {
        -webkit-appearance: none; appearance: none; flex: none; margin: 1px 0 0;
        width: 16px; height: 16px; border-radius: 4px; cursor: pointer;
        background: var(--surface); border: 1.5px solid var(--tertiary);
        display: grid; place-items: center;
        transition: background-color 150ms ease-out, border-color 150ms ease-out;
      }
      .remember-checkbox:hover { border-color: var(--secondary); }
      .remember-checkbox:checked { background: var(--accent); border-color: var(--accent); }
      .remember-checkbox:checked::after {
        content: ''; width: 10px; height: 10px; background: var(--accent-ink);
        -webkit-mask: no-repeat center / 10px 10px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 5.2l2 2L8 3'/%3E%3C/svg%3E");
        mask: no-repeat center / 10px 10px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 5.2l2 2L8 3'/%3E%3C/svg%3E");
      }
      .remember-text { min-width: 0; }
      .remember-scope {
        display: inline; font-weight: 600; color: var(--accent); border-radius: 4px; padding: 0 1px;
      }
      .remember-scope .chev { display: inline-block; width: 9px; height: 9px; margin-left: 2px; vertical-align: 0; }
      .remember-scope:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 2px; }
      .remember-scope[disabled] { cursor: inherit; text-decoration: none; color: var(--label); }

      /* Footer: [Paused ·] reason · Why here?   [Save] */
      .card-foot { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; }
      .foot-text { min-width: 0; font-size: 11.5px; line-height: 15px; color: var(--secondary); }
      .countdown-info { display: inline; }
      .paused-word { color: var(--tertiary); }
      .paused-word[hidden] { display: none; }
      .foot-dot { color: var(--tertiary); padding: 0 1px; }
      .why-btn { display: inline; color: var(--accent); font-weight: 400; border-radius: 3px; white-space: nowrap; }
      .why-btn:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 2px; }
      .save-btn {
        flex: none; display: inline-flex; align-items: center; justify-content: center;
        height: 30px; min-width: 64px; padding: 0 14px; border-radius: 8px;
        font-size: 13px; font-weight: 600; color: var(--accent-ink); background: var(--accent);
        transition: background-color 150ms ease-out;
      }
      .save-btn:hover { background: var(--accent-hover); }
      .save-btn:active { transform: translateY(.5px); }

      /* "Why here?" explainer: the rule chain, one line per step */
      .why-list { list-style: none; margin-top: 10px; padding: 9px 0 1px; border-top: 1px solid var(--hairline); font-size: 11.5px; line-height: 17px; color: var(--secondary); }
      .why-list[hidden] { display: none; }
      .why-list li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 4px; }
      .why-list .mark { color: var(--tertiary); text-align: center; }
      .why-list li.hit { color: var(--label); }
      .why-list li.hit .mark { color: var(--accent); font-weight: 600; }
      .why-list .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .why-list b { font-weight: 600; }
      .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

      /* Countdown: 2px accent hairline along the bottom edge, shrinking to 0 */
      .progress {
        position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
        background: var(--accent); transform-origin: left center; transform: scaleX(1);
        transition: transform 60ms linear, opacity 150ms ease-out;
      }
      .progress.paused { opacity: .45; }
      .progress[hidden] { display: none; }

      /* Folder menu (sibling of the card; the only surface with blur) */
      .folder-menu {
        position: absolute; z-index: 2;
        width: 252px; max-width: calc(100vw - 24px);
        border-radius: 12px; padding: 5px; font-size: 13px; line-height: 18px;
        background: var(--surface);
        background: color-mix(in srgb, var(--surface) 92%, transparent);
        -webkit-backdrop-filter: blur(20px);
        backdrop-filter: blur(20px);
        border: 1px solid var(--hairline-strong); box-shadow: var(--shadow);
        overflow-y: auto; overscroll-behavior: contain;
        transform-origin: bottom left;
        animation: dr-menu 150ms ease-out;
      }
      .folder-menu[hidden] { display: none; }
      @keyframes dr-menu { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
      .menu-head { display: flex; align-items: center; gap: 8px; font-size: 11.5px; line-height: 15px; color: var(--secondary); padding: 5px 9px 4px; min-height: 24px; }
      .menu-head .hint-r { margin-left: auto; color: var(--tertiary); }
      .menu-filter { color: var(--label); }
      .menu-filter .search-ico { width: 13px; height: 13px; color: var(--tertiary); flex: none; }
      .menu-filter .q { white-space: pre; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .menu-filter .caret { width: 1px; height: 13px; background: var(--accent); flex: none; margin-left: -7px; }
      .folder-menu-item {
        width: 100%; height: 30px; display: flex; align-items: center; gap: 7px;
        padding: 0 9px 0 6px; border-radius: 8px; text-align: left; font-size: 13px; font-weight: 400; color: var(--label);
      }
      .folder-menu-item:focus-visible { outline: none; }
      .folder-menu-item .ck { width: 14px; flex: none; display: grid; place-items: center; color: var(--accent); }
      .folder-menu-item .ck svg { width: 11px; height: 11px; }
      .folder-menu-item .fold-ico { width: 16px; height: 16px; flex: none; color: var(--secondary); }
      .folder-menu-item[aria-checked="true"] .fold-ico { color: var(--accent); }
      .folder-menu-item .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .folder-menu-item .label mark { background: none; color: inherit; font-weight: 600; }
      .folder-menu-item .hint { margin-left: auto; padding-left: 8px; font-size: 11.5px; color: var(--tertiary); flex: none; font-variant-numeric: tabular-nums; }
      .folder-menu-item.hl { background: var(--accent-soft); }
      .menu-empty { font-size: 12px; color: var(--tertiary); padding: 6px 9px 6px 27px; }
      .menu-sep { height: 1px; background: var(--hairline); margin: 4px 6px; }
      .new-folder-wrap { padding: 4px 4px 2px; }
      .new-folder-wrap .menu-head { padding: 0 4px 6px; min-height: 0; }
      .new-folder-hint { font-size: 11.5px; line-height: 15px; color: var(--tertiary); padding: 7px 4px 2px; }
      .new-folder-suggestions:not(:empty) { margin-top: 4px; }

      /* End states: the header becomes "✓ Saved to Code" */
      .overlay-container.is-result .file-row,
      .overlay-container.is-result .remember-row,
      .overlay-container.is-result .card-foot,
      .overlay-container.is-result .why-list,
      .overlay-container.is-result .progress,
      .overlay-container.is-result .folder-menu { display: none; }
      .overlay-success { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: center; grid-column: 1 / -1; }
      .overlay-success .tile .res-ico { width: 18px; height: 18px; color: var(--success); }
      .overlay-success.is-error .tile .res-ico { color: var(--danger); }
      .result-title { font-size: 15px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .overlay-success .tile { animation: dr-pop 180ms ease-out; }
      @keyframes dr-pop { from { transform: scale(.9); opacity: .3; } to { transform: none; opacity: 1; } }

      @media (forced-colors: active) {
        :focus-visible { outline: 2px solid CanvasText !important; outline-offset: 2px; }
        .card, .folder-menu { border: 1px solid CanvasText; }
        .folder-menu-item.hl { outline: 2px solid Highlight; outline-offset: -2px; }
        .progress { background: Highlight; forced-color-adjust: none; }
        .remember-checkbox { forced-color-adjust: auto; }
      }
      @media (prefers-reduced-motion: reduce) {
        .overlay-container, .folder-menu, .remember-row, .overlay-success .tile { animation: none; }
        .overlay-container.leaving { transition: none; }
        .progress { transition: none; }
      }
    `;
  }

  /* ----------------------------------------------------------------------------------------
   * Derived display values
   * ---------------------------------------------------------------------------------------- */

  /**
   * Folder the download is currently going to: a relative folder ("Code", "Projects/Boats",
   * "Downloads") or an absolute path (companion app).
   */
  getCurrentFolder(info = this.currentDownloadInfo) {
    if (!info) return 'Downloads';
    if (info.absoluteDestination) return info.absoluteDestination;
    return folderOfRelativePath(info.resolvedPath || info.filename);
  }

  /**
   * The folder name shown in results ("Saved to Code").
   */
  folderNameFromPath(relativePath) {
    return folderDisplayName(folderOfRelativePath(relativePath));
  }

  sameFolder(a, b) {
    const norm = (f) => {
      const n = normalizePath(String(f || ''));
      return isAbsolutePath(f) ? n : (n.replace(/^downloads(\/|$)/i, '') || 'downloads').toLowerCase();
    };
    return norm(a) === norm(b);
  }

  folderChanged() {
    return !!this.currentDownloadInfo && !this.sameFolder(this.getCurrentFolder(), this.originalFolder);
  }

  /**
   * Footnote explaining why the download goes where it goes.
   */
  getReasonText() {
    const info = this.currentDownloadInfo;
    if (!info) return '';
    if (this.savedEarlyPath !== null && this.savedEarlyPath !== undefined) {
      return `Saved in ${this.folderNameFromPath(this.savedEarlyPath)} for now · Save moves it`;
    }
    // Once the user picks another folder, the rule no longer explains the destination
    if (this.folderChanged()) return 'Your choice';
    let rule = info.finalRule;
    // Background no longer asks on ties; if tied rules still arrive, the first one is used
    if ((!rule || rule.source === 'default') && info.conflictRules && info.conflictRules.length > 0) {
      rule = info.conflictRules[0];
    }
    const source = rule ? (rule.source || 'default') : 'default';
    if (source === 'domain') {
      return `Your ${rule.value || getBaseDomain(info.domain)} rule`;
    }
    if (source === 'contains') {
      const phrase = String(rule.value || '').split(',').map(p => p.trim()).filter(Boolean)[0] || '';
      return `Names with “${phrase}”`;
    }
    if (source === 'filetype') {
      const group = rule.groupName || '';
      return group ? `Matched file type · ${group.charAt(0).toUpperCase()}${group.slice(1)}` : 'Matched file type';
    }
    if (source === 'extension') {
      return `.${info.extension || rule.value || ''} files rule`;
    }
    return 'No rule matched';
  }

  /**
   * The rule that routed this download (the first tied rule when background left a tie).
   */
  getRoutingRule() {
    const info = this.currentDownloadInfo;
    if (!info) return null;
    let rule = info.finalRule;
    if ((!rule || rule.source === 'default') && info.conflictRules && info.conflictRules.length > 0) {
      rule = info.conflictRules[0];
    }
    return rule || { source: 'default' };
  }

  /**
   * "Why here?" lines: the rule chain in order (Websites → File names → File types →
   * Everything else), ✓ on the step that decided. Steps before it didn't match (the chain is
   * checked in order, first match wins); steps after it were never checked.
   * Returns [{ hit, html }] with every untrusted value escaped.
   */
  getWhySteps() {
    const info = this.currentDownloadInfo;
    if (!info) return [];
    const esc = escapeHTML;
    const rule = this.getRoutingRule();
    const source = rule.source || 'default';
    const decided = { domain: 0, contains: 1, extension: 2, filetype: 2 }[source] ?? 3;
    const routed = esc(folderDisplayName(this.originalFolder));
    // Earlier steps only provably "didn't match" when the winning rule has its normal place in
    // the chain. A custom priority (old data) could let it outrank an earlier match.
    const standardPriority = { domain: 2, contains: 2, extension: 2, filetype: 3 }[source];
    const priority = Number.parseFloat(rule.priority);
    const inOrder = source === 'default' || (!rule.overrideDomainRules &&
      (!Number.isFinite(priority) || Math.abs(priority - standardPriority) < 0.01));

    let hitText;
    if (source === 'domain') {
      hitText = `Websites · ${esc(rule.value || getBaseDomain(info.domain))} → <b>${routed}</b>`;
    } else if (source === 'contains') {
      const name = String(this.originalFilename || info.filename || '').toLowerCase();
      const phrases = String(rule.value || '').split(',').map(p => p.trim()).filter(Boolean);
      const phrase = phrases.find(p => name.includes(p.toLowerCase())) || phrases[0] || '';
      hitText = `File names · “${esc(phrase)}” → <b>${routed}</b>`;
    } else if (source === 'extension') {
      hitText = `File types · .${esc(info.extension || rule.value || '')} files → <b>${routed}</b>`;
    } else if (source === 'filetype') {
      const group = String(rule.groupName || '');
      hitText = `File types · ${esc(group ? group.charAt(0).toUpperCase() + group.slice(1) : 'Group')} → <b>${routed}</b>`;
    } else {
      hitText = `Everything else → <b>${routed}</b>`;
    }
    const labels = ['Websites', 'File names', 'File types'];
    const steps = labels.map((label, i) => {
      if (i === decided) return { hit: true, html: hitText };
      if (i < decided) return { hit: false, html: `${label} · ${inOrder ? 'no match' : 'not used'}` };
      return { hit: false, html: `${label} · not checked` };
    });
    steps.push(decided === 3 ? { hit: true, html: hitText } : { hit: false, html: 'Everything else · not needed' });

    if (this.folderChanged()) {
      // The user's pick decided; the chain is what it would have done
      steps.forEach(step => { step.hit = false; });
      steps.unshift({ hit: true, html: `You picked <b>${esc(folderDisplayName(this.getCurrentFolder()))}</b> on this card` });
    }
    return steps;
  }

  renderWhy() {
    const list = this.shadowRoot?.querySelector('.why-list');
    const btn = this.shadowRoot?.querySelector('.why-btn');
    if (!list) return;
    list.hidden = !this.whyOpen;
    if (btn) btn.setAttribute('aria-expanded', String(!!this.whyOpen));
    if (!this.whyOpen) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = this.getWhySteps().map(step =>
      `<li class="${step.hit ? 'hit' : ''}"><span class="mark" aria-hidden="true">${step.hit ? '✓' : '–'}</span><span class="txt">${step.hit ? '<span class="sr">Decided: </span>' : ''}${step.html}</span></li>`
    ).join('');
  }

  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? (bytes / Math.pow(1024, i) >= 10 ? 0 : 1) : 0);
    return `${size} ${units[i]}`;
  }

  getMetaText() {
    const info = this.currentDownloadInfo;
    const parts = [];
    const size = this.formatFileSize(info.fileSize || info.totalBytes);
    if (size) parts.push(size);
    const host = info.domain && info.domain !== 'unknown' ? String(info.domain).replace(/^www\./i, '') : '';
    if (host) parts.push(host);
    return parts.join(' · ') || (info.extension ? `.${info.extension} file` : 'Download');
  }

  /**
   * Remember-row scopes available for this download.
   */
  getRememberOptions() {
    const info = this.currentDownloadInfo || {};
    const site = getBaseDomain(info.domain);
    const ext = String(info.extension || '').toLowerCase();
    return { site, ext, canSite: !!site, canType: !!ext };
  }

  /* ----------------------------------------------------------------------------------------
   * Showing the card
   * ---------------------------------------------------------------------------------------- */

  async showDownloadOverlay(downloadInfo, confirmationTimeout, confirmationEnabled) {
    try {
      // Ignore duplicate requests for the download that is already on screen
      if (this.shadowRoot && this.currentDownloadInfo && this.currentDownloadInfo.id === downloadInfo.id) {
        return;
      }

      // Another download's card is still displayed: save it with its current choice before
      // replacing it, so its choices are never applied to (or lost to) the new one
      if (this.shadowRoot && this.currentDownloadInfo && !this.saving) {
        const displaced = this.currentDownloadInfo;
        const rememberRule = this.getRememberRule();
        const proceed = () => this.sendMessage({ type: 'proceedWithDownload', downloadInfo: displaced });
        if (rememberRule) {
          this.sendMessage({ type: 'addRule', rule: rememberRule }, () => { void chrome.runtime.lastError; proceed(); });
        } else {
          proceed();
        }
      }

      this.resetOverlayState();

      if (!this.shadowRoot) {
        this.createShadowDOM();
      }

      this.currentDownloadInfo = downloadInfo;
      this.countdownEnabled = !!confirmationEnabled;
      this.configuredTimeoutSeconds = confirmationTimeout ? Math.max(1, Math.floor(confirmationTimeout / 1000)) : 5;
      this.countdownTotal = this.configuredTimeoutSeconds * 1000;
      this.timeLeft = this.countdownTotal;
      this.originalFolder = this.getCurrentFolder(downloadInfo);
      this.originalFilename = downloadInfo.filename || '';
      const opts = this.getRememberOptions();
      this.rememberScope = opts.canSite ? 'site' : 'type';

      this.createOverlayContent();
      this.setupEventListeners();
      if (confirmationEnabled) {
        this.startCountdown();
      }
      this.updateFooter();

      // Warm the folder list and companion status for the menu
      this.loadFolderSuggestions();
      this.sendMessage({ type: 'checkCompanionApp' }, (status) => {
        void chrome.runtime.lastError;
        if (this.currentDownloadInfo === downloadInfo) {
          this.companionInstalled = !!(status && status.installed);
        }
      });
    } catch (error) {
      console.error('[Download Router] Failed to show the download card, using a notification:', error);
      this.showFallbackNotification(downloadInfo);
    }
  }

  /**
   * Resets per-download state before a new card is shown. Keeps the shadow root for reuse.
   */
  resetOverlayState() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.savedEarlyPath = null;
    this.countdownPaused = false;
    this.saving = false;
    this.pointerInside = false;
    this.focusInside = false;
    this.resetCardState();
  }

  /**
   * True while a menu, inline field or native picker is open. The card never auto-saves then,
   * and background treats it as "still choosing".
   */
  hasOpenEditor() {
    return !!(this.menuOpen || this.renameOpen || this.nativePickerOpen);
  }

  /**
   * Builds the card markup. Every untrusted value goes through escapeHTML.
   */
  createOverlayContent() {
    const info = this.currentDownloadInfo;
    const esc = escapeHTML;
    const kind = fileKind(info.extension);
    const type = typeLabel(info.extension);

    const html = `
      <div class="overlay-container" role="dialog" aria-label="Save download: ${esc(info.filename)}">
        <div class="card">
          <div class="overlay-header">
            <div class="dest">
              <span class="dest-label" id="dr-dest-label">Saving to</span>
              <button class="folder-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-describedby="dr-dest-label">${ICONS.folder}<span class="folder-name"></span>${ICONS.chevron}</button>
              <div class="folder-path" hidden></div>
            </div>
            <button class="cancel-download-btn" type="button" title="Cancel download" aria-label="Cancel download">${ICONS.close}</button>
          </div>

          <div class="file-row">
            <div class="tile${type ? ' has-type' : ''}" aria-hidden="true">${ICONS[kind]}${type ? `<span class="type">${esc(type)}</span>` : ''}</div>
            <div class="name-col">
              <div class="filename"></div>
              <div class="meta">${esc(this.getMetaText())}</div>
            </div>
          </div>

          <label class="remember-row" hidden>
            <input type="checkbox" class="remember-checkbox">
            <span class="remember-text"></span>
          </label>

          <div class="card-foot">
            <div class="foot-text"><span class="countdown-info" aria-live="polite"><span class="paused-word" hidden></span><span class="overlay-reason"></span></span><span class="foot-dot" aria-hidden="true"> · </span><button class="why-btn" type="button" aria-expanded="false" aria-controls="dr-why">Why here?</button></div>
            <button class="save-btn" type="button">Save</button>
          </div>
          <ul class="why-list" id="dr-why" aria-label="Why this folder" hidden></ul>
          <div class="progress" aria-hidden="true"></div>
        </div>
        <div class="folder-menu" role="menu" aria-label="Choose a folder" hidden></div>
      </div>
    `;

    this.shadowRoot.innerHTML = this.shadowRoot.querySelector('style').outerHTML + html;
    this.currentOverlay = this.shadowRoot.querySelector('.overlay-container');
    this.pointerInside = false;
    this.focusInside = false;
    this.attachEngagementListeners(this.currentOverlay);
    this.updateView();
  }

  /**
   * Fills a .filename element with a middle-ellipsis name: the head shrinks, the tail (last few
   * characters + extension) always stays visible. textContent stays the full name.
   */
  setFilenameText(el, name) {
    const full = String(name || '');
    const dot = full.lastIndexOf('.');
    const tailLen = Math.min(full.length, dot > 0 && full.length - dot <= 10 ? full.length - dot + 6 : 9);
    const head = document.createElement('span');
    head.className = 'fn-head';
    head.textContent = full.slice(0, full.length - tailLen);
    const tail = document.createElement('span');
    tail.className = 'fn-tail';
    tail.textContent = full.slice(full.length - tailLen);
    el.replaceChildren(head, tail);
    el.title = full;
  }

  /**
   * "Downloads › Projects › Forks" under the folder button, only for nested/absolute folders.
   */
  getFolderPathParts(folder) {
    if (isAbsolutePath(folder)) {
      let parts = String(folder).replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts[0] === 'Users' && parts.length > 2) parts = ['~', ...parts.slice(2)];
      return parts.length > 4 ? ['…', ...parts.slice(-3)] : parts;
    }
    const rel = normalizePath(folder).replace(/^downloads(\/|$)/i, '');
    const parts = rel.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const all = ['Downloads', ...parts];
    return all.length > 4 ? ['Downloads', '…', ...all.slice(-2)] : all;
  }

  /**
   * Refreshes the parts of the card that depend on state (folder, reason, remember row).
   */
  updateView() {
    const root = this.shadowRoot;
    const info = this.currentDownloadInfo;
    if (!root || !info) return;
    const folder = this.getCurrentFolder();
    const btn = root.querySelector('.folder-btn');
    if (btn) {
      btn.title = isAbsolutePath(folder) ? folder : (this.sameFolder(folder, 'Downloads') ? 'Downloads' : `Downloads/${normalizePath(folder).replace(/^downloads\//i, '')}`);
      btn.querySelector('.folder-name').textContent = folderDisplayName(folder);
    }
    const pathEl = root.querySelector('.folder-path');
    if (pathEl) {
      const parts = this.getFolderPathParts(folder);
      pathEl.hidden = !parts;
      pathEl.innerHTML = parts ? parts.map(escapeHTML).join('<span class="sep" aria-hidden="true">›</span>') : '';
    }
    if (!this.renameOpen) {
      const nameEl = root.querySelector('.filename');
      if (nameEl) this.setFilenameText(nameEl, info.filename);
    }
    this.updateRememberRow();
    this.updateFooter();
    if (this.whyOpen) this.renderWhy();
  }

  updateRememberRow() {
    const row = this.shadowRoot?.querySelector('.remember-row');
    if (!row) return;
    const opts = this.getRememberOptions();
    const show = this.folderChanged() && (opts.canSite || opts.canType);
    row.hidden = !show;
    if (!show) {
      this.rememberChecked = false;
      row.querySelector('.remember-checkbox').checked = false;
      return;
    }
    if (this.rememberScope === 'site' && !opts.canSite) this.rememberScope = 'type';
    if (this.rememberScope === 'type' && !opts.canType) this.rememberScope = 'site';
    const canToggle = opts.canSite && opts.canType;
    const scopeLabel = this.rememberScope === 'site' ? opts.site : `all .${opts.ext} files`;
    const scopeBtn = `<button type="button" class="remember-scope" ${canToggle ? '' : 'disabled'} title="${canToggle ? 'Switch between this website and this file type' : ''}">${escapeHTML(scopeLabel)}${canToggle ? ICONS.chevron : ''}</button>`;
    const text = this.rememberScope === 'site'
      ? `Always save files from ${scopeBtn} here`
      : `Always save ${scopeBtn} here`;
    const textEl = row.querySelector('.remember-text');
    const hadFocus = this.shadowRoot.activeElement && this.shadowRoot.activeElement.classList.contains('remember-scope');
    textEl.innerHTML = text;
    const checkbox = row.querySelector('.remember-checkbox');
    checkbox.checked = this.rememberChecked;
    checkbox.setAttribute('aria-label', this.rememberScope === 'site'
      ? `Always save files from ${opts.site} to ${folderDisplayName(this.getCurrentFolder())}`
      : `Always save .${opts.ext} files to ${folderDisplayName(this.getCurrentFolder())}`);
    const scope = textEl.querySelector('.remember-scope');
    if (scope && canToggle) {
      scope.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.rememberScope = this.rememberScope === 'site' ? 'type' : 'site';
        this.updateRememberRow();
      });
      if (hadFocus) scope.focus();
    }
  }

  /**
   * Rule to add on Save when "Always" is ticked, or null.
   */
  getRememberRule() {
    if (!this.currentDownloadInfo || !this.rememberChecked || !this.folderChanged()) return null;
    const opts = this.getRememberOptions();
    const folder = this.getCurrentFolder();
    if (this.rememberScope === 'site' && opts.canSite) {
      return { type: 'domain', value: opts.site, folder };
    }
    if (this.rememberScope === 'type' && opts.canType) {
      return { type: 'extension', value: opts.ext, folder };
    }
    return null;
  }

  /**
   * Footer: reason (with a quiet "Paused ·" while held) and the countdown hairline.
   */
  updateFooter() {
    const root = this.shadowRoot;
    if (!root || !this.currentDownloadInfo) return;
    const reason = root.querySelector('.overlay-reason');
    const pausedWord = root.querySelector('.paused-word');
    const counting = !!this.countdownTimer && !this.countdownPaused && this.countdownEnabled;
    const savedEarly = this.savedEarlyPath !== null && this.savedEarlyPath !== undefined;
    if (reason) {
      const text = this.getReasonText();
      if (reason.textContent !== text) reason.textContent = text;
      reason.title = text;
    }
    if (pausedWord) {
      // Text only while paused, so the live region never announces a hidden "Paused"
      const showPaused = !(counting || savedEarly || !this.countdownEnabled);
      pausedWord.hidden = !showPaused;
      pausedWord.textContent = showPaused ? 'Paused · ' : '';
    }
    const bar = root.querySelector('.progress');
    if (bar) {
      bar.hidden = !this.countdownEnabled;
      bar.classList.toggle('paused', !counting);
    }
    this.updateProgress();
  }

  /**
   * Countdown hairline: full width at the start, 0 when the card saves.
   */
  updateProgress() {
    const bar = this.shadowRoot?.querySelector('.progress');
    if (!bar) return;
    const total = this.countdownTotal || 1;
    const remaining = Math.max(0, Math.min(total, this.timeLeft));
    bar.style.transform = `scaleX(${(remaining / total).toFixed(4)})`;
  }

  /* ----------------------------------------------------------------------------------------
   * Events
   * ---------------------------------------------------------------------------------------- */

  setupEventListeners() {
    const root = this.shadowRoot;

    root.querySelector('.cancel-download-btn').addEventListener('click', () => this.cancelDownload());
    root.querySelector('.save-btn').addEventListener('click', () => this.saveDownload());

    const folderBtn = root.querySelector('.folder-btn');
    folderBtn.addEventListener('click', () => {
      if (this.menuOpen) this.closeMenu(true);
      else this.openMenu();
    });
    folderBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.menuOpen) this.openMenu({ focus: e.key === 'ArrowUp' ? 'last' : 'current' });
        else this.focusMenuItem(this.menuIndex >= 0 ? this.menuIndex : 0);
      } else if (e.key === 'Escape' && this.menuOpen) {
        e.preventDefault();
        this.closeMenu(true);
      }
    });

    const checkbox = root.querySelector('.remember-checkbox');
    checkbox.addEventListener('change', () => {
      this.rememberChecked = checkbox.checked;
    });

    root.querySelector('.why-btn').addEventListener('click', () => {
      this.whyOpen = !this.whyOpen;
      this.renderWhy();
    });

    const menu = root.querySelector('.folder-menu');
    menu.addEventListener('keydown', (e) => this.handleMenuKeydown(e));
    menu.addEventListener('mouseleave', () => {
      // Keep the keyboard highlight while filtering; drop the hover highlight otherwise
      if (this.menuOpen && this.menuMode === 'list' && !this.menuFilter) this.highlightMenuItem(-1);
    });
  }

  /**
   * Pauses the countdown while the pointer is over the card or keyboard focus is inside it,
   * and resumes it once the user disengages (unless a menu or field is open).
   */
  updateEngagement() {
    this.syncCountdown();
  }

  attachEngagementListeners(container) {
    if (!container || container.dataset.engagementAttached) return;
    container.dataset.engagementAttached = 'true';
    container.addEventListener('mouseenter', () => {
      this.pointerInside = true;
      this.updateEngagement();
    });
    container.addEventListener('mouseleave', () => {
      this.pointerInside = false;
      this.updateEngagement();
    });
    container.addEventListener('focusin', (e) => {
      // Keyboard focus (or a text field) holds the countdown; focus left on a button after a
      // mouse click doesn't, so the card still saves once the pointer leaves
      const t = e.target;
      const typing = !!(t && t.tagName === 'INPUT' && t.type === 'text');
      this.focusInside = typing || this.keyboardNav;
      this.updateEngagement();
    });
    container.addEventListener('focusout', (e) => {
      if (e.relatedTarget && container.contains(e.relatedTarget)) return;
      this.focusInside = false;
      this.updateEngagement();
    });
  }

  /* ----------------------------------------------------------------------------------------
   * Folder menu
   * ---------------------------------------------------------------------------------------- */

  loadFolderSuggestions(callback = null) {
    const info = this.currentDownloadInfo;
    this.sendMessage({ type: 'getFolderSuggestions' }, (response) => {
      void chrome.runtime.lastError;
      if (this.currentDownloadInfo !== info) return;
      if (response && response.success && Array.isArray(response.folders)) {
        this.folderSuggestions = response.folders.filter(f => f && f.path);
      }
      if (callback) callback();
    });
  }

  /**
   * Display label of a folder in the menu ("Projects/Boats", "Downloads", or an absolute path).
   */
  menuLabel(path) {
    return isAbsolutePath(path) ? path : (normalizePath(path).replace(/^downloads\//i, '') || 'Downloads');
  }

  /**
   * Menu entries: folders you use (current one first, with a checkmark), then Downloads.
   * While the user types, every known folder matching the filter (best matches first, max 9).
   */
  getMenuEntries() {
    const current = this.getCurrentFolder();
    const query = String(this.menuFilter || '').trim().toLowerCase();
    if (query) {
      const all = [];
      [{ path: current }, ...this.folderSuggestions, { path: 'Downloads' }].forEach(f => {
        if (f && f.path && !all.some(x => this.sameFolder(x.path, f.path))) all.push({ path: f.path });
      });
      const score = (f) => {
        const label = this.menuLabel(f.path).toLowerCase();
        const name = folderDisplayName(f.path).toLowerCase();
        if (name.startsWith(query)) return 0;
        if (label.startsWith(query) || label.includes('/' + query) || name.includes(' ' + query)) return 1;
        return label.includes(query) ? 2 : -1;
      };
      return all.map((f, i) => ({ f, s: score(f), i }))
        .filter(x => x.s >= 0)
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .slice(0, 9)
        .map(x => x.f);
    }
    const others = this.folderSuggestions
      .filter(f => !this.sameFolder(f.path, current) && !this.sameFolder(f.path, 'Downloads'))
      .slice(0, 4)
      .map(f => ({ path: f.path }));
    const folders = [{ path: current }, ...others];
    if (!this.sameFolder(current, 'Downloads')) folders.push({ path: 'Downloads' });
    return folders;
  }

  openMenu({ focus = 'current' } = {}) {
    if (!this.currentDownloadInfo || this.saving) return;
    if (this.renameOpen) this.closeRename(true);
    this.menuOpen = true;
    this.menuMode = 'list';
    this.menuFilter = '';
    this.syncCountdown();
    this.renderMenu();
    this.shadowRoot.querySelector('.folder-btn').setAttribute('aria-expanded', 'true');
    const items = this.menuItems();
    const currentIndex = items.findIndex(el => el.getAttribute('aria-checked') === 'true');
    this.focusMenuItem(focus === 'last' ? items.length - 1 : Math.max(0, currentIndex));
    // Refresh the list (recent use order may have changed since the card opened)
    this.loadFolderSuggestions(() => {
      if (this.menuOpen && this.menuMode === 'list' && !this.menuFilter) {
        const idx = this.menuIndex;
        this.renderMenu();
        this.focusMenuItem(Math.min(Math.max(0, idx), this.menuItems().length - 1));
      }
    });
  }

  closeMenu(returnFocus = true) {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menuMode = 'list';
    this.menuIndex = -1;
    this.menuFilter = '';
    const root = this.shadowRoot;
    if (!root) return;
    const menu = root.querySelector('.folder-menu');
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
    }
    const btn = root.querySelector('.folder-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) btn.focus();
    }
    this.syncCountdown();
  }

  menuItems() {
    return [...(this.shadowRoot?.querySelectorAll('.folder-menu [role^="menuitem"]') || [])];
  }

  /**
   * Places the menu above the folder button (the card sits at the bottom of the viewport),
   * or below it when there's more room there, clamped to the viewport.
   */
  positionMenu() {
    const root = this.shadowRoot;
    const menu = root.querySelector('.folder-menu');
    const btn = root.querySelector('.folder-btn');
    const container = this.currentOverlay;
    if (!menu || !btn || !container) return;
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // Opening upward, the menu sits above the card's top edge so it never covers "Saving to"
    const cardEl = root.querySelector('.card');
    const top = cardEl ? cardEl.getBoundingClientRect().top : b.top;
    const spaceAbove = top - 12;
    const spaceBelow = window.innerHeight - b.bottom - 12;
    const up = spaceAbove >= Math.min(260, spaceBelow) || spaceAbove >= spaceBelow;
    menu.style.maxHeight = `${Math.max(120, (up ? spaceAbove : spaceBelow) - 6)}px`;
    const width = Math.min(252, window.innerWidth - 24);
    let left = b.left - 6;
    left = Math.max(12, Math.min(left, window.innerWidth - 12 - width));
    menu.style.left = `${left - c.left}px`;
    if (up) {
      menu.style.top = 'auto';
      menu.style.bottom = `${c.bottom - top + 6}px`;
      menu.style.transformOrigin = 'bottom left';
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = `${b.bottom - c.top + 6}px`;
      menu.style.transformOrigin = 'top left';
    }
  }

  renderMenu() {
    const root = this.shadowRoot;
    const menu = root && root.querySelector('.folder-menu');
    if (!menu) return;
    const current = this.getCurrentFolder();
    const esc = escapeHTML;

    if (this.menuMode === 'new-folder') {
      menu.innerHTML = `
        <div class="new-folder-wrap" role="none">
          <div class="menu-head" id="dr-new-folder-label">New folder in Downloads</div>
          <input type="text" class="new-folder-input" spellcheck="false" autocomplete="off" placeholder="Folder name, like Projects/Boats"
            aria-labelledby="dr-new-folder-label" aria-autocomplete="list" aria-controls="dr-new-folder-list">
          <div class="field-error new-folder-error" role="alert"></div>
          <div class="new-folder-suggestions" id="dr-new-folder-list" role="listbox"></div>
          <div class="new-folder-hint">Return to choose · Esc to go back</div>
        </div>`;
      menu.hidden = false;
      this.positionMenu();
      this.setupNewFolderField(menu.querySelector('.new-folder-input'));
      return;
    }

    const folders = this.getMenuEntries();
    const query = String(this.menuFilter || '');
    const q = query.trim().toLowerCase();
    const markMatch = (label) => {
      const i = q ? label.toLowerCase().indexOf(q) : -1;
      if (i < 0) return esc(label);
      return `${esc(label.slice(0, i))}<mark>${esc(label.slice(i, i + q.length))}</mark>${esc(label.slice(i + q.length))}`;
    };
    const items = folders.map((f, i) => {
      const checked = this.sameFolder(f.path, current);
      const label = this.menuLabel(f.path);
      return `<button type="button" class="folder-menu-item" role="menuitemradio" aria-checked="${checked}" tabindex="-1" data-path="${esc(f.path)}" title="${esc(label)}"${i < 9 ? ` aria-keyshortcuts="${i + 1}"` : ''}>
          <span class="ck" aria-hidden="true">${checked ? ICONS.check : ''}</span>${ICONS.folder}<span class="label">${markMatch(label)}</span>${i < 9 ? `<span class="hint" aria-hidden="true">${i + 1}</span>` : ''}
        </button>`;
    }).join('');
    const head = query
      ? `<div class="menu-head menu-filter" role="presentation">${ICONS.search}<span class="q">${esc(query)}</span><span class="hint-r">Esc clears</span></div>`
      : '<div class="menu-head" role="presentation">Folders you use<span class="hint-r">Type to filter</span></div>';
    menu.innerHTML = `
      ${head}
      ${items}
      ${query && !folders.length ? '<div class="menu-empty" role="presentation">No folders match</div>' : ''}
      <div class="menu-sep" role="separator"></div>
      <button type="button" class="folder-menu-item folder-menu-new" role="menuitem" tabindex="-1"><span class="ck" aria-hidden="true"></span><span class="label">${q ? `New Folder “${esc(query.trim())}”…` : 'New Folder…'}</span></button>
      <button type="button" class="folder-menu-item folder-menu-rename" role="menuitem" tabindex="-1"><span class="ck" aria-hidden="true"></span><span class="label">Rename File…</span></button>
      ${this.companionInstalled ? '<button type="button" class="folder-menu-item folder-menu-other" role="menuitem" tabindex="-1"><span class="ck" aria-hidden="true"></span><span class="label">Other Location…</span></button>' : ''}
    `;
    menu.hidden = false;
    this.positionMenu();

    this.menuItems().forEach((item, index) => {
      item.addEventListener('mouseenter', () => this.highlightMenuItem(index));
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activateMenuItem(item);
      });
    });
  }

  /**
   * Type-to-filter: re-renders the list and highlights the best match.
   */
  setMenuFilter(value) {
    this.menuFilter = value;
    this.renderMenu();
    this.focusMenuItem(0);
  }

  highlightMenuItem(index) {
    this.menuItems().forEach((el, i) => el.classList.toggle('hl', i === index));
    if (index >= 0) this.menuIndex = index;
  }

  focusMenuItem(index) {
    const items = this.menuItems();
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    this.highlightMenuItem(i);
    items[i].focus();
    items[i].scrollIntoView({ block: 'nearest' });
  }

  handleMenuKeydown(e) {
    if (this.menuMode !== 'list') return;
    const items = this.menuItems();
    const plainKey = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focusMenuItem(this.menuIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focusMenuItem(this.menuIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.focusMenuItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      this.focusMenuItem(items.length - 1);
    } else if (plainKey && /^[1-9]$/.test(e.key)) {
      // 1–9 pick the folder with that number
      e.preventDefault();
      const folderItems = items.filter(el => el.dataset.path);
      const item = folderItems[Number(e.key) - 1];
      if (item) this.activateMenuItem(item);
    } else if (e.key === 'Enter' || (e.key === ' ' && !this.menuFilter)) {
      e.preventDefault();
      if (items[this.menuIndex]) this.activateMenuItem(items[this.menuIndex]);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.menuFilter) this.setMenuFilter(this.menuFilter.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // First Esc clears the filter, the next one closes
      if (this.menuFilter) this.setMenuFilter('');
      else this.closeMenu(true);
    } else if (e.key === 'Tab') {
      this.closeMenu(true);
    } else if (plainKey && e.key.length === 1 && this.menuFilter.length < 60) {
      // Letters (and anything printable) filter the folder list
      e.preventDefault();
      this.setMenuFilter(this.menuFilter + e.key);
    }
  }

  activateMenuItem(item) {
    if (item.classList.contains('folder-menu-new')) {
      // "New Folder “pro”…" starts the field with what was typed
      this.newFolderPrefill = String(this.menuFilter || '').trim();
      this.menuFilter = '';
      this.menuMode = 'new-folder';
      this.renderMenu();
      return;
    }
    if (item.classList.contains('folder-menu-rename')) {
      this.closeMenu(false);
      this.openRename();
      return;
    }
    if (item.classList.contains('folder-menu-other')) {
      this.closeMenu(false);
      this.pickOtherLocation();
      return;
    }
    const path = item.dataset.path;
    this.closeMenu(true);
    if (path) this.setFolder(path);
  }

  /**
   * Inline "New Folder…" field: autocompletes from the folders you use; Return confirms.
   */
  setupNewFolderField(input) {
    if (!input) return;
    const list = this.shadowRoot.querySelector('.new-folder-suggestions');
    const errorEl = this.shadowRoot.querySelector('.new-folder-error');
    let matches = [];
    let active = -1;

    const render = () => {
      list.innerHTML = matches.map((path, i) => `
        <div class="folder-menu-item${i === active ? ' hl' : ''}" role="option" aria-selected="${i === active}" data-index="${i}" id="dr-nf-${i}" style="cursor:pointer">
          <span class="ck" aria-hidden="true"></span>${ICONS.folder}<span class="label">${escapeHTML(path)}</span>
        </div>`).join('');
      if (active >= 0) input.setAttribute('aria-activedescendant', `dr-nf-${active}`);
      else input.removeAttribute('aria-activedescendant');
      list.querySelectorAll('.folder-menu-item').forEach(el => {
        // mousedown (not click) so the input keeps focus
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = matches[parseInt(el.dataset.index, 10)];
          confirm();
        });
      });
      this.positionMenu();
    };
    const filter = () => {
      const q = input.value.trim().replace(/\\/g, '/').replace(/^downloads\//i, '').toLowerCase();
      const all = this.folderSuggestions.map(f => f.path).filter(p => !this.sameFolder(p, 'Downloads'));
      matches = q ? all.filter(p => p.toLowerCase().includes(q) && p.toLowerCase() !== q).slice(0, 5) : [];
      active = -1;
      render();
    };
    const showError = (message) => {
      errorEl.textContent = message || '';
      input.classList.toggle('invalid', !!message);
    };
    const confirm = () => {
      const check = validateFolderInput(input.value, this.companionInstalled);
      if (check.error) {
        showError(check.error);
        input.focus();
        return;
      }
      this.closeMenu(true);
      this.setFolder(check.value);
    };

    input.addEventListener('input', () => {
      showError('');
      filter();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && matches.length) {
        e.preventDefault();
        active = Math.min(active + 1, matches.length - 1);
        render();
      } else if (e.key === 'ArrowUp' && matches.length) {
        e.preventDefault();
        active = Math.max(active - 1, -1);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && matches[active]) input.value = matches[active];
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (matches.length && active >= 0) {
          active = -1;
          render();
          return;
        }
        // Back to the folder list
        this.menuMode = 'list';
        this.renderMenu();
        this.menuFilter = '';
        const newItem = this.menuItems().findIndex(el => el.classList.contains('folder-menu-new'));
        this.focusMenuItem(newItem);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (matches.length) {
          input.value = matches[active >= 0 ? active : 0];
          filter();
        }
      }
    });
    input.focus();
    if (this.newFolderPrefill) {
      input.value = this.newFolderPrefill;
      this.newFolderPrefill = '';
      filter();
    }
  }

  /**
   * Points the download at a folder: relative (inside Downloads) or absolute (companion app).
   */
  setFolder(folder) {
    const info = this.currentDownloadInfo;
    if (!info || this.saving || !folder) return;
    if (isAbsolutePath(folder)) {
      info.absoluteDestination = folder;
      info.useAbsolutePath = true;
      info.needsMove = true;
      info.resolvedPath = extractFilename(info.filename);
    } else {
      info.absoluteDestination = null;
      info.useAbsolutePath = false;
      info.needsMove = false;
      info.resolvedPath = buildRelativePath(folder, info.filename);
    }
    if (!this.folderSuggestions.some(f => this.sameFolder(f.path, folder))) {
      this.folderSuggestions.unshift({ path: folder, count: 0 });
    }
    this.syncPendingInfo();
    this.updateView();
  }

  /**
   * Tells background about the current choice, so its own timer saves to the right place.
   */
  syncPendingInfo() {
    if (!this.currentDownloadInfo) return;
    this.sendMessage({ type: 'updatePendingDownloadInfo', downloadInfo: this.currentDownloadInfo }, () => {
      void chrome.runtime.lastError;
    });
  }

  /**
   * "Other Location…": native folder picker (companion app only).
   */
  pickOtherLocation() {
    const info = this.currentDownloadInfo;
    if (!info) return;
    this.nativePickerOpen = true;
    this.syncCountdown();
    const start = isAbsolutePath(this.getCurrentFolder()) ? this.getCurrentFolder() : null;
    this.sendMessage({ type: 'pickFolderNative', startPath: start }, (response) => {
      void chrome.runtime.lastError;
      if (this.currentDownloadInfo !== info) return;
      this.nativePickerOpen = false;
      if (response && response.success && response.path) {
        this.setFolder(response.path);
      }
      this.shadowRoot?.querySelector('.folder-btn')?.focus();
      this.syncCountdown();
    });
  }

  /* ----------------------------------------------------------------------------------------
   * Rename
   * ---------------------------------------------------------------------------------------- */

  openRename() {
    const root = this.shadowRoot;
    const info = this.currentDownloadInfo;
    if (!root || !info || this.saving) return;
    const nameEl = root.querySelector('.filename');
    if (!nameEl) return;
    this.renameOpen = true;
    this.syncCountdown();
    nameEl.outerHTML = `<div class="filename-edit"><input type="text" class="rename-input" spellcheck="false" autocomplete="off" aria-label="File name" value="${escapeHTML(info.filename)}"><div class="field-error rename-error" role="alert"></div></div>`;
    const input = root.querySelector('.rename-input');
    const errorEl = root.querySelector('.rename-error');
    // Select the name without the extension, like Finder
    const dot = info.filename.lastIndexOf('.');
    input.focus();
    input.setSelectionRange(0, dot > 0 ? dot : info.filename.length);

    let done = false;
    const finish = (commit) => {
      if (done) return;
      if (commit) {
        const check = validateFilenameInput(input.value);
        if (check.error) {
          errorEl.textContent = check.error;
          input.classList.add('invalid');
          input.focus();
          return;
        }
        done = true;
        this.applyRename(check.value);
      } else {
        done = true;
      }
      this.closeRename(false);
      this.shadowRoot?.querySelector('.folder-btn')?.focus();
    };
    input.addEventListener('input', () => {
      errorEl.textContent = '';
      input.classList.remove('invalid');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => {
      // Clicking away keeps a valid name, like Finder; an invalid one is dropped
      if (done || !this.renameOpen) return;
      if (validateFilenameInput(input.value).error) finish(false);
      else finish(true);
    });
    this.renameFinish = finish;
  }

  closeRename(commit) {
    if (!this.renameOpen) return;
    const root = this.shadowRoot;
    const edit = root && root.querySelector('.filename-edit');
    if (commit && this.renameFinish) {
      const finish = this.renameFinish;
      this.renameFinish = null;
      finish(true);
      return;
    }
    this.renameOpen = false;
    this.renameFinish = null;
    if (edit && this.currentDownloadInfo) {
      const div = document.createElement('div');
      div.className = 'filename';
      edit.replaceWith(div);
    }
    this.updateView();
    this.syncCountdown();
  }

  applyRename(newName) {
    const info = this.currentDownloadInfo;
    if (!info) return;
    info.filename = newName;
    if (info.absoluteDestination) {
      info.resolvedPath = newName;
    } else {
      info.resolvedPath = buildRelativePath(this.getCurrentFolder(), newName);
    }
    const header = this.currentOverlay;
    if (header) header.setAttribute('aria-label', `Save download: ${newName}`);
    this.syncPendingInfo();
  }

  /* ----------------------------------------------------------------------------------------
   * Countdown
   * ---------------------------------------------------------------------------------------- */

  /**
   * Starts a fresh countdown with the configured timeout.
   */
  startCountdown(timeoutSeconds = null, remainingMs = null) {
    if (!this.shadowRoot || !this.currentDownloadInfo || this.saving) return;
    const seconds = Number(timeoutSeconds) || this.configuredTimeoutSeconds || 5;
    this.countdownTotal = seconds * 1000;
    this.timeLeft = remainingMs > 0 ? Math.min(remainingMs, this.countdownTotal) : this.countdownTotal;
    this.countdownPaused = false;
    if (this.hasOpenEditor() || this.pointerInside || this.focusInside || this.reloading) {
      this.pauseCountdown();
      return;
    }
    this.startTicking();
  }

  startTicking() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const interval = 50;
    this.countdownTimer = setInterval(() => {
      if (this.countdownPaused || this.hasOpenEditor() || !this.shadowRoot || this.saving) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        return;
      }
      this.timeLeft -= interval;
      this.updateProgress();
      if (this.timeLeft <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.saveDownload();
      }
    }, interval);
    this.updateFooter();
  }

  /**
   * Pauses the countdown here and background's auto-save timer.
   */
  pauseCountdown() {
    const wasPaused = this.countdownPaused && !this.countdownTimer;
    this.countdownPaused = true;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.updateFooter();
    if (!wasPaused && this.currentDownloadInfo && this.currentDownloadInfo.id) {
      this.sendMessage({ type: 'pauseDownloadTimeout', downloadId: this.currentDownloadInfo.id }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  /**
   * Stops the countdown completely (used while saving or re-evaluating rules).
   */
  cancelCountdown() {
    this.countdownPaused = true;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.updateFooter();
    if (this.currentDownloadInfo && this.currentDownloadInfo.id) {
      this.sendMessage({ type: 'cancelDownloadTimeout', downloadId: this.currentDownloadInfo.id }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  /**
   * Resumes from the remaining time (at least 2s so the user sees it counting again).
   */
  resumeCountdown() {
    if (!this.shadowRoot || !this.currentDownloadInfo || this.saving || this.countdownEnabled === false) return;
    if (this.hasOpenEditor() || this.pointerInside || this.focusInside || this.reloading) return;
    const total = (this.configuredTimeoutSeconds || 5) * 1000;
    let remaining = this.timeLeft > 0 && this.timeLeft < total ? this.timeLeft : total;
    remaining = Math.max(remaining, Math.min(total, 2000));
    this.countdownTotal = total;
    this.timeLeft = remaining;
    this.countdownPaused = false;
    this.startTicking();
    if (this.currentDownloadInfo.id) {
      this.sendMessage({ type: 'resumeDownloadTimeout', downloadId: this.currentDownloadInfo.id, remainingTime: remaining }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  /**
   * Pauses or resumes the countdown to match what the user is doing.
   */
  syncCountdown() {
    if (!this.currentDownloadInfo || !this.shadowRoot || this.saving || this.countdownEnabled === false) return;
    const hold = this.hasOpenEditor() || this.pointerInside || this.focusInside || this.reloading;
    if (hold) {
      if (!this.countdownPaused || this.countdownTimer) this.pauseCountdown();
    } else if (this.countdownPaused) {
      this.resumeCountdown();
    }
  }

  /* ----------------------------------------------------------------------------------------
   * Save / cancel / results
   * ---------------------------------------------------------------------------------------- */

  getResultHTML(title, subtitle = '', isError = false) {
    return `
      <div class="overlay-success${isError ? ' is-error' : ''}" role="status">
        <div class="tile" aria-hidden="true">${isError ? ICONS.err : ICONS.ok}</div>
        <div class="name-col">
          <div class="result-title success-title">${escapeHTML(title)}</div>
          ${subtitle ? `<div class="meta success-sub">${escapeHTML(subtitle)}</div>` : ''}
        </div>
      </div>
    `;
  }

  showResult(title, subtitle, isError = false) {
    const header = this.shadowRoot?.querySelector('.overlay-header');
    if (!header) return;
    this.resultSeq = (this.resultSeq || 0) + 1;
    this.currentOverlay?.classList.add('is-result');
    header.innerHTML = this.getResultHTML(title, subtitle, isError);
  }

  reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  }

  /**
   * Signature save motion: the file tile slides and shrinks into the folder button, then
   * `done` runs. Immediate under reduced motion.
   */
  playSaveMotion(done) {
    const root = this.shadowRoot;
    const row = root && root.querySelector('.file-row');
    const tile = row && row.querySelector('.tile');
    const target = root && root.querySelector('.folder-btn .fold-ico');
    if (!tile || !target || this.reducedMotion()) {
      done();
      return;
    }
    const from = tile.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    row.classList.add('flying');
    void tile.offsetWidth; // start the transition from the resting position
    tile.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.4)`;
    tile.style.opacity = '0.15';
    setTimeout(done, SAVE_MOTION_MS);
  }

  /**
   * Fades the card out, then removes it (only if that download is still the one shown).
   */
  closeLater(downloadId, delayMs) {
    setTimeout(() => {
      if (!this.currentDownloadInfo || this.currentDownloadInfo.id !== downloadId) return;
      if (this.reducedMotion() || !this.currentOverlay) {
        this.cleanup(downloadId);
        return;
      }
      this.currentOverlay.classList.add('leaving');
      setTimeout(() => this.cleanup(downloadId), 170);
    }, delayMs);
  }

  /**
   * Chrome's time limit forced background to save the file. Keep the card open if the user is
   * still choosing (or already chose somewhere else); otherwise say where it went and close.
   */
  handleSavedEarly(savedPath) {
    this.savedEarlyPath = savedPath;
    const info = this.currentDownloadInfo;
    const choseElsewhere = !this.sameFolder(folderOfRelativePath(savedPath), this.getCurrentFolder()) ||
      extractFilename(savedPath) !== extractFilename(info.filename) || !!info.absoluteDestination;
    if (this.hasOpenEditor() || choseElsewhere) {
      this.updateView();
      return;
    }
    const rule = this.getRememberRule();
    if (rule) this.sendMessage({ type: 'addRule', rule }, () => { void chrome.runtime.lastError; });
    this.saving = true;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.showResult(`Saved to ${this.folderNameFromPath(savedPath)}`, info.filename);
    this.closeLater(info.id, 1000);
  }

  /**
   * Saves the download to the current choice (adding the "Always" rule first when ticked).
   */
  saveDownload() {
    if (this.saving || !this.currentDownloadInfo) return;
    // Commit an open rename field first (Save while typing a name keeps the typed name)
    if (this.renameOpen) {
      const input = this.shadowRoot?.querySelector('.rename-input');
      if (input && validateFilenameInput(input.value).error) {
        this.closeRename(false);
      } else {
        this.closeRename(true);
      }
    }
    if (this.menuOpen) this.closeMenu(false);

    this.saving = true;
    const downloadInfo = this.currentDownloadInfo;
    const rememberRule = this.getRememberRule();

    if (!downloadInfo.resolvedPath) {
      downloadInfo.resolvedPath = buildRelativePath(this.getCurrentFolder(downloadInfo), downloadInfo.filename);
    }

    // Stop both timers so nothing else saves meanwhile
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownPaused = true;
    if (downloadInfo.id) {
      this.sendMessage({ type: 'cancelDownloadTimeout', downloadId: downloadInfo.id }, () => { void chrome.runtime.lastError; });
    }
    this.shadowRoot?.querySelectorAll('button, input').forEach(el => { el.disabled = true; });

    const folderName = folderDisplayName(this.getCurrentFolder(downloadInfo));
    const moving = this.savedEarlyPath !== null && this.savedEarlyPath !== undefined;
    // File → folder motion first; a result that arrives meanwhile (error, moved) wins
    const seq = this.resultSeq || 0;
    this.playSaveMotion(() => {
      if (this.currentDownloadInfo === downloadInfo && (this.resultSeq || 0) === seq) {
        this.showResult(moving ? `Moving to ${folderName}…` : `Saved to ${folderName}`, downloadInfo.filename);
      }
    });

    if (!downloadInfo.id) {
      this.cleanup();
      return;
    }

    const isCurrent = () => this.currentDownloadInfo && this.currentDownloadInfo.id === downloadInfo.id;
    const proceed = () => {
      this.sendMessage({ type: 'proceedWithDownload', downloadInfo }, (response) => {
        const lastErrorMessage = chrome.runtime.lastError && chrome.runtime.lastError.message;
        if (lastErrorMessage) {
          console.error('[Download Router] proceedWithDownload failed:', lastErrorMessage);
          if (isCurrent()) {
            this.showResult('Couldn’t save', 'Try downloading it again', true);
            this.closeLater(downloadInfo.id, 2000);
          }
          return;
        }
        if (!isCurrent()) return;
        if (response && response.relocated) {
          this.showResult(`Moved to ${this.folderNameFromPath(response.savedPath || downloadInfo.resolvedPath)}`, downloadInfo.filename);
          this.closeLater(downloadInfo.id, 1200);
        } else if (response && response.success === false && (moving || response.savedPath)) {
          // Couldn't move the already-saved file: say where it actually is
          const where = response.savedPath ? this.folderNameFromPath(response.savedPath) : this.folderNameFromPath(this.savedEarlyPath);
          this.showResult('Couldn’t move it', `It’s in ${where}`, true);
          this.closeLater(downloadInfo.id, 3000);
        } else if (ruleError) {
          // The file was saved, but "Always save…" didn't stick: say so instead of failing silently
          this.showResult(`Saved to ${folderName}`, ruleError, true);
          this.closeLater(downloadInfo.id, 4000);
        } else {
          this.closeLater(downloadInfo.id, moving ? 900 : 600);
        }
      });
    };
    let ruleError = null;

    if (rememberRule) {
      // Save the rule first, so the next download from this site/type already goes there
      this.sendMessage({ type: 'addRule', rule: rememberRule }, (response) => {
        void chrome.runtime.lastError;
        if (!response || response.success === false) {
          const full = /quota/i.test((response && response.error) || '');
          ruleError = full
            ? 'Rule not saved: too many rules for Chrome sync. Remove some in Settings.'
            : 'Rule not saved. Try again from Settings.';
        }
        proceed();
      });
    } else {
      proceed();
    }
  }

  /**
   * ✕: cancels the download (or, after an early save, just closes and keeps the file).
   */
  cancelDownload() {
    if (!this.currentDownloadInfo || this.saving) return;
    const downloadId = this.currentDownloadInfo.id;
    if (this.savedEarlyPath !== null && this.savedEarlyPath !== undefined) {
      this.cleanup(downloadId);
      return;
    }
    this.sendMessage({ type: 'cancelDownload', downloadId });
    this.cleanup(downloadId);
  }

  /* ----------------------------------------------------------------------------------------
   * Messaging, storage, teardown
   * ---------------------------------------------------------------------------------------- */

  /**
   * Sends a message to the background script without throwing when the extension
   * context is gone (e.g. after an extension update). On failure the card is removed,
   * since the background timer will proceed with the download on its own.
   */
  sendMessage(message, callback = null) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        throw new Error('Extension context invalidated.');
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (callback) {
          callback(response);
        } else {
          // Read lastError so fire-and-forget failures aren't reported as unchecked
          void chrome.runtime.lastError;
        }
      });
      return true;
    } catch (error) {
      console.warn('[Download Router] Could not reach the extension (' + (error && error.message) + '), removing the card');
      this.handleContextInvalidated();
      return false;
    }
  }

  /**
   * Tears this instance down for good (used when content.js is re-injected after an
   * extension install/update): removes the card, clears timers and makes the
   * message listener a no-op.
   */
  destroy() {
    this.destroyed = true;
    window.removeEventListener('keydown', this.navKeyHandler, true);
    window.removeEventListener('pointerdown', this.navPointerHandler, true);
    this.cleanup();
  }

  handleContextInvalidated() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.cleanup();
  }

  /**
   * Removes the card and resets state. With a downloadId, only if that download is still shown
   * (delayed cleanups for an older download must not remove a newer download's card).
   */
  cleanup(downloadId = null) {
    if (downloadId !== null && downloadId !== undefined &&
        (!this.currentDownloadInfo || this.currentDownloadInfo.id !== downloadId)) {
      return;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    this.countdownTimer = null;
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler, true);
      this.documentClickHandler = null;
    }
    if (this.shadowHost) {
      this.shadowHost.remove();
    }
    this.shadowHost = null;
    this.shadowRoot = null;
    this.currentOverlay = null;
    this.currentDownloadInfo = null;
    this.countdownPaused = false;
    this.saving = false;
    this.savedEarlyPath = null;
    this.pointerInside = false;
    this.focusInside = false;
    this.resetCardState();
  }

  /**
   * Falls back to a Chrome notification when the card can't be injected.
   */
  async showFallbackNotification(downloadInfo) {
    try {
      await chrome.runtime.sendMessage({ type: 'showFallbackNotification', downloadInfo });
    } catch (error) {
      console.error('[Download Router] Fallback notification failed:', error);
      this.saveDownload();
    }
  }

  /**
   * Rules changed while the card is open: ask background to re-route this download and update
   * the card. A folder or name the user already picked on the card is kept.
   */
  reloadRulesAndUpdateOverlay() {
    if (!this.currentDownloadInfo || !this.shadowRoot || this.saving) return;
    const downloadInfo = this.currentDownloadInfo;
    const userChoseFolder = this.folderChanged();
    const userRenamed = downloadInfo.filename !== this.originalFilename;
    const chosen = {
      filename: downloadInfo.filename,
      resolvedPath: downloadInfo.resolvedPath,
      absoluteDestination: downloadInfo.absoluteDestination,
      useAbsolutePath: downloadInfo.useAbsolutePath,
      needsMove: downloadInfo.needsMove
    };

    // Hold the countdown while background re-evaluates
    this.reloading = true;
    this.syncCountdown();

    const finish = () => {
      this.reloading = false;
      this.syncCountdown();
    };

    this.sendMessage({ type: 'reEvaluateDownloadRules', downloadId: downloadInfo.id, downloadInfo }, (response) => {
      void chrome.runtime.lastError;
      if (this.currentDownloadInfo !== downloadInfo || this.saving) return;
      if (!(response && response.success && response.updatedDownloadInfo)) {
        finish();
        return;
      }
      const updated = response.updatedDownloadInfo;
      downloadInfo.finalRule = updated.finalRule;
      downloadInfo.conflictRules = updated.conflictRules;
      const routedFolder = this.getCurrentFolder(updated);
      if (userChoseFolder) {
        Object.assign(downloadInfo, chosen);
      } else {
        Object.assign(downloadInfo, {
          resolvedPath: updated.resolvedPath,
          absoluteDestination: updated.absoluteDestination,
          useAbsolutePath: updated.useAbsolutePath,
          needsMove: updated.needsMove
        });
        if (userRenamed) {
          downloadInfo.filename = chosen.filename;
          downloadInfo.resolvedPath = downloadInfo.absoluteDestination ? chosen.filename : buildRelativePath(routedFolder, chosen.filename);
        }
      }
      this.originalFolder = routedFolder;
      this.updateView();
      this.sendMessage({ type: 'updatePendingDownloadInfo', downloadInfo }, () => {
        void chrome.runtime.lastError;
        if (this.currentDownloadInfo === downloadInfo) finish();
      });
    });
  }
}

/**
 * Initialize the card system when the content script loads.
 * background.js may re-inject this file into already-open tabs after install/update,
 * so replace any previous (possibly orphaned) instance and its leftover card.
 */
if (window.__downloadRouterOverlay) {
  try {
    window.__downloadRouterOverlay.destroy();
  } catch (error) {
    // Old instance may belong to an invalidated extension context - ignore
  }
}
document.querySelectorAll('#download-router-shadow-host').forEach(el => el.remove());

const downloadOverlay = new DownloadOverlay();
window.__downloadRouterOverlay = downloadOverlay;
})();
