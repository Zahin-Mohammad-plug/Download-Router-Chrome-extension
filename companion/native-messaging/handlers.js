/**
 * handlers.js
 * 
 * Platform: Cross-platform (macOS, Windows, Linux)
 * Purpose: Message handlers for native messaging protocol.
 * Role: Routes incoming messages to appropriate service functions based on message type.
 * 
 * Platform Support:
 * - Message routing is platform-agnostic
 * - Services called from handlers are cross-platform (folder-operations, file-mover)
 * - Error handling and response formatting work identically on all platforms
 * 
 * Key Responsibilities:
 * - Route messages to folder operations, file mover services
 * - Handle version checks and capability queries
 * - Provide error handling and response formatting
 * 
 * Note: pickFolder and showSaveAsDialog are handled directly in main.js
 * using native OS commands (folder-picker-native.js, file-save-dialog.js)
 * for faster response times without Electron overhead.
 */

const folderOperations = require('../services/folder-operations');
const fileMover = require('../services/file-mover');
const fileSaveDialog = require('../services/file-save-dialog');

/**
 * Main message handler router.
 * Processes messages and routes to appropriate service handlers.
 * 
 * Inputs:
 *   - message: Object containing message type and data
 *   - context: Object containing Electron APIs (dialog, etc.)
 * 
 * Outputs: Promise resolving to response object or null (if not handled)
 * 
 * External Dependencies:
 *   - folderOperations: Service for folder verification, creation, listing
 *   - fileMover: Service for post-download file moving
 *   - fileSaveDialog: Service for native Save As dialogs (used in main.js, kept here for other handlers)
 */
async function handleMessage(message, context) {
  const { type } = message;
  console.error('handleMessage called with type:', type);
  console.error('Context dialog available:', !!context.dialog);

  switch (type) {
    case 'getVersion':
      return handleGetVersion();
    
    // Note: pickFolder is handled directly in main.js using folder-picker-native.js
    // This case is never reached but kept for reference
    case 'pickFolder':
      // This should never execute - main.js handles pickFolder before reaching handlers
      return null;
    
    case 'verifyFolder':
      return folderOperations.verifyFolder(message.path);
    
    case 'createFolder':
      return folderOperations.createFolder(message.path);
    
    case 'listFolders':
      return folderOperations.listFolders(message.path);
    
    case 'moveFile':
      return await fileMover.moveFile(message.source, message.destination);
    
    case 'showSaveAsDialog':
      console.error('Handling showSaveAsDialog message, filename:', message.filename, 'defaultDirectory:', message.defaultDirectory);
      const saveAsResult = await fileSaveDialog.showSaveAsDialog(message.filename, message.defaultDirectory || null);
      console.error('showSaveAsDialog result:', JSON.stringify(saveAsResult));
      return saveAsResult;
    
    default:
      return null; // Let host send unknown type error
  }
}

/**
 * Handles version check requests.
 * Returns companion app version and platform information.
 * 
 * Inputs: None (reads from app metadata)
 * 
 * Outputs: Object containing version and platform info
 */
function handleGetVersion() {
  // Read version from package.json or use hardcoded version
  const version = require('../package.json').version;
  // process.platform: Node.js platform identifier
  //   Inputs: None
  //   Outputs: String ('darwin' for macOS, 'win32' for Windows, 'linux' for Linux)
  const platform = process.platform;
  
  return {
    success: true,
    type: 'version',
    version: version,
    platform: platform
  };
}

module.exports = {
  handleMessage
};
