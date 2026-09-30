/**
 * Download Router - Shared input validation for rules, file types and folders.
 * Used by popup.js and options.js so both pages accept and store the same values.
 *
 * Every function returns { value, error }. When error is set, value should not be saved.
 */
(function () {
  // Unix paths count as absolute only when they start at a real system root, matching
  // isAbsolutePath() in background.js. "/Videos" is treated as the Videos subfolder.
  const SYSTEM_ROOT = /^\/(Users|Volumes|home|mnt|media|tmp|private|opt|var|srv|run|Applications|Library|System)(\/|$)/;
  const WINDOWS_ABSOLUTE = /^([A-Za-z]:[\\/]|\\\\[^\\])/;
  const INVALID_FOLDER_CHARS = /[<>:"|?*\x00-\x1f]/;

  function isAbsolutePath(path) {
    if (!path) return false;
    return WINDOWS_ABSOLUTE.test(path) || SYSTEM_ROOT.test(path);
  }

  /**
   * Validates a destination folder.
   * Relative folders are stored without leading/trailing slashes and without a leading "Downloads/".
   *
   * Inputs:
   *   - folder: String typed or picked by the user
   *   - options.companionInstalled: Boolean, absolute paths need the companion app
   *   - options.allowEmpty: Boolean, empty means the Downloads root
   */
  function validateFolder(folder, { companionInstalled = false, allowEmpty = true } = {}) {
    const raw = String(folder || '').trim();
    if (!raw || /^downloads\/?$/i.test(raw)) {
      return allowEmpty ? { value: 'Downloads' } : { error: 'Choose a destination folder.' };
    }

    if (isAbsolutePath(raw)) {
      if (!companionInstalled) {
        return { error: 'Folders outside Downloads need the companion app. Use a folder name like "Invoices" instead.' };
      }
      return { value: raw };
    }

    const cleaned = raw
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/+/g, '/')
      .replace(/^downloads\//i, '');

    if (INVALID_FOLDER_CHARS.test(cleaned)) {
      return { error: 'Folder names can\'t contain < > : " | ? * characters.' };
    }
    if (cleaned.split('/').some(segment => segment.trim() === '..' || segment.trim() === '.')) {
      return { error: 'Folder names can\'t be "." or "..".' };
    }
    return { value: cleaned || 'Downloads' };
  }

  /**
   * Validates a website rule. Accepts "github.com", "https://www.github.com/org/repo/" etc.
   * Stores "github.com" or "github.com/org/repo".
   */
  function validateDomain(value) {
    let normalized = String(value || '').trim()
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .replace(/^www\./i, '');
    if (!normalized) {
      return { error: 'Enter a website, like github.com.' };
    }
    const slashIndex = normalized.indexOf('/');
    const host = (slashIndex === -1 ? normalized : normalized.substring(0, slashIndex)).split(':')[0].toLowerCase();
    const path = slashIndex === -1 ? '' : normalized.substring(slashIndex);
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') || (!host.includes('.') && host !== 'localhost')) {
      return { error: 'That doesn\'t look like a website. Try something like github.com.' };
    }
    return { value: host + path };
  }

  /**
   * Validates a "filename contains" rule: comma-separated phrases, empty phrases dropped.
   */
  function validateContains(value) {
    const phrases = String(value || '').split(',').map(p => p.trim()).filter(p => p.length > 0);
    if (phrases.length === 0) {
      return { error: 'Enter at least one word the filename should contain.' };
    }
    return { value: phrases.join(', ') };
  }

  function validateRuleValue(type, value) {
    if (type === 'contains') return validateContains(value);
    if (type === 'extension') {
      const check = validateExtensions(value);
      return check.error ? { error: 'Enter a file extension, like zip.' } : check;
    }
    return validateDomain(value);
  }

  /**
   * Validates a file type's extension list. ".PDF, docx,,pdf" → "pdf,docx".
   */
  function validateExtensions(value) {
    const seen = new Set();
    const extensions = String(value || '')
      .split(/[,\s]+/)
      .map(ext => ext.trim().toLowerCase().replace(/^\.+/, ''))
      .filter(ext => ext.length > 0 && !seen.has(ext) && seen.add(ext));
    if (extensions.length === 0) {
      return { error: 'Enter at least one file extension, like pdf.' };
    }
    if (extensions.some(ext => !/^[a-z0-9_+-]+$/.test(ext))) {
      return { error: 'Extensions can only contain letters and numbers, like pdf or mp4.' };
    }
    return { value: extensions.join(',') };
  }

  /**
   * Folder inside Downloads used for an absolute folder when the companion app isn't available.
   * Matches relativeFallbackFolder() in background.js.
   */
  function relativeFallbackFolder(absolutePath) {
    const segments = String(absolutePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
    const downloadsIndex = segments.map(seg => seg.toLowerCase()).lastIndexOf('downloads');
    if (downloadsIndex !== -1) {
      return segments.slice(downloadsIndex + 1).join('/') || 'Downloads';
    }
    const last = segments[segments.length - 1] || '';
    return /^[A-Za-z]:$/.test(last) || !last ? 'Downloads' : last;
  }

  /**
   * Escapes text for safe use inside innerHTML (text and attribute values).
   */
  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  self.DRValidation = {
    isAbsolutePath,
    validateFolder,
    validateDomain,
    validateContains,
    validateRuleValue,
    validateExtensions,
    relativeFallbackFolder,
    escapeHTML
  };
})();
