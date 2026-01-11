/**
 * folder-picker.js
 * 
 * Purpose: Native OS folder picker dialog service.
 * Role: Opens native folder selection dialogs (macOS Finder, Windows Explorer)
 *       and returns the selected absolute folder path.
 * 
 * Key Responsibilities:
 * - Display native OS folder picker dialog
 * - Return absolute path of selected folder
 * - Handle user cancellation gracefully
 */

/**
 * Opens a native OS folder picker dialog and returns selected path.
 * 
 * Inputs:
 *   - startPath: Optional string absolute path to start dialog at
 *   - dialog: Electron dialog API object
 * 
 * Outputs: Promise resolving to response object with selected path or error
 * 
 * External Dependencies:
 *   - dialog.showOpenDialog: Electron API for native folder picker
 *   - process.platform: Node.js platform detection
 */
async function pickFolder(startPath, dialog) {
  if (!dialog) {
    return {
      success: false,
      error: 'Dialog API not available',
      code: 'NO_DIALOG_API'
    };
  }

  try {
    // dialog.showOpenDialog: Opens native folder picker dialog
    //   Inputs: Options object with properties, callback function (optional)
    //   Outputs: Promise resolving to object with canceled and filePaths properties
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'], // Only allow folder selection
      defaultPath: startPath || undefined, // Start at provided path if given
      title: 'Select Download Folder'
    });

    // Check if user cancelled dialog
    if (result.canceled) {
      return {
        success: false,
        error: 'User cancelled folder selection',
        code: 'CANCELLED',
        type: 'folderPicked'
      };
    }

    // Get selected folder path (first item in array)
    // filePaths: Array of selected folder paths (single selection mode)
    const selectedPath = result.filePaths && result.filePaths[0];

    if (!selectedPath) {
      return {
        success: false,
        error: 'No folder selected',
        code: 'NO_SELECTION',
        type: 'folderPicked'
      };
    }

    // Normalize path separators based on platform
    // On Windows, normalize to backslashes; on Unix-like, use forward slashes
    const normalizedPath = normalizePathForPlatform(selectedPath);

    return {
      success: true,
      type: 'folderPicked',
      path: normalizedPath
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error opening folder picker',
      code: 'DIALOG_ERROR',
      type: 'folderPicked'
    };
  }
}

/**
 * Normalizes path separators based on platform.
 * Windows uses backslashes, Unix-like systems use forward slashes.
 * 
 * Inputs:
 *   - path: String path to normalize
 * 
 * Outputs: String with normalized path separators
 */
function normalizePathForPlatform(path) {
  // process.platform: Node.js platform identifier
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: Use backslashes
    return path.replace(/\//g, '\\');
  } else {
    // macOS/Linux: Use forward slashes
    return path.replace(/\\/g, '/');
  }
}

module.exports = {
  pickFolder
};
