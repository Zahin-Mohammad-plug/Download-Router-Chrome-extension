/**
 * handlers.js
 * 
 * Purpose: Message handlers for native messaging protocol.
 * Role: Routes incoming messages to appropriate service functions based on message type.
 * 
 * Key Responsibilities:
 * - Route messages to folder picker, folder operations, file mover services
 * - Handle version checks and capability queries
 * - Provide error handling and response formatting
 */

const folderPicker = require('../services/folder-picker');
const folderOperations = require('../services/folder-operations');
const fileMover = require('../services/file-mover');

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
 *   - folderPicker: Service for native folder picker dialogs
 *   - folderOperations: Service for folder verification, creation, listing
 *   - fileMover: Service for post-download file moving
 */
async function handleMessage(message, context) {
  const { type } = message;
  console.error('handleMessage called with type:', type);
  console.error('Context dialog available:', !!context.dialog);

  switch (type) {
    case 'getVersion':
      return handleGetVersion();
    
    case 'pickFolder':
      console.error('Handling pickFolder message, startPath:', message.startPath);
      const result = await folderPicker.pickFolder(message.startPath || null, context.dialog, context.dialogWindow);
      console.error('pickFolder result:', JSON.stringify(result));
      return result;
    
    case 'verifyFolder':
      return folderOperations.verifyFolder(message.path);
    
    case 'createFolder':
      return folderOperations.createFolder(message.path);
    
    case 'listFolders':
      return folderOperations.listFolders(message.path);
    
    case 'moveFile':
      return await fileMover.moveFile(message.source, message.destination);
    
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
