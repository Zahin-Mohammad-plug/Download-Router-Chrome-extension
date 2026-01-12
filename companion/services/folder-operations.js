/**
 * folder-operations.js
 * 
 * Platform: Cross-platform (macOS, Windows, Linux)
 * Purpose: File system folder operations service.
 * Role: Provides OS-level folder operations: verification, creation, and listing.
 * 
 * Platform Support:
 * - Uses Node.js fs module which is cross-platform
 * - Path handling works identically on all platforms
 * - Permissions and file system operations are handled by Node.js
 * 
 * Key Responsibilities:
 * - Verify if folders exist
 * - Create folders with proper permissions
 * - List folder contents for browsing
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Verifies if a folder exists and is accessible.
 * 
 * Inputs:
 *   - folderPath: String absolute path to folder
 * 
 * Outputs: Object indicating if folder exists and is accessible
 * 
 * External Dependencies:
 *   - fs.access: Node.js file system API for checking access
 *   - fs.stat: Node.js file system API for getting file stats
 */
async function verifyFolder(folderPath) {
  if (!folderPath) {
    return {
      success: false,
      error: 'No folder path provided',
      code: 'INVALID_PATH'
    };
  }

  try {
    // fs.access: Checks if file/folder exists and is accessible
    //   Inputs: Path string, mode flags (fs.constants.F_OK for existence)
    //   Outputs: Promise (rejects if not accessible)
    await fs.access(folderPath, fs.constants.F_OK);
    
    // fs.stat: Gets file/folder statistics
    //   Inputs: Path string
    //   Outputs: Promise resolving to Stats object
    const stats = await fs.stat(folderPath);
    
    // Check if path is actually a directory (not a file)
    if (!stats.isDirectory()) {
      return {
        success: false,
        exists: false,
        error: 'Path exists but is not a directory',
        code: 'NOT_DIRECTORY',
        path: folderPath
      };
    }

    return {
      success: true,
      exists: true,
      path: folderPath
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Folder does not exist
      return {
        success: true,
        exists: false,
        path: folderPath
      };
    }
    
    // Other error (permission denied, etc.)
    return {
      success: false,
      exists: false,
      error: error.message || 'Error checking folder',
      code: error.code || 'ACCESS_ERROR',
      path: folderPath
    };
  }
}

/**
 * Creates a folder (and parent directories if needed).
 * 
 * Inputs:
 *   - folderPath: String absolute path to folder to create
 * 
 * Outputs: Object indicating success or error
 * 
 * External Dependencies:
 *   - fs.mkdir: Node.js file system API for creating directories
 *   - path.dirname: Node.js path API for getting parent directory
 */
async function createFolder(folderPath) {
  if (!folderPath) {
    return {
      success: false,
      error: 'No folder path provided',
      code: 'INVALID_PATH'
    };
  }

  try {
    // fs.mkdir: Creates directory
    //   Inputs: Path string, options object with recursive flag
    //   Outputs: Promise (rejects if creation fails)
    // recursive: true creates parent directories if they don't exist
    await fs.mkdir(folderPath, { recursive: true });
    
    return {
      success: true,
      created: true,
      path: folderPath
    };
  } catch (error) {
    return {
      success: false,
      created: false,
      error: error.message || 'Error creating folder',
      code: error.code || 'CREATE_ERROR',
      path: folderPath
    };
  }
}

/**
 * Lists folder contents (subdirectories and files).
 * 
 * Inputs:
 *   - folderPath: String absolute path to folder to list
 * 
 * Outputs: Object containing list of folder items with metadata
 * 
 * External Dependencies:
 *   - fs.readdir: Node.js file system API for reading directory contents
 *   - fs.stat: Node.js file system API for getting file stats
 *   - path.join: Node.js path API for joining path segments
 */
async function listFolders(folderPath) {
  if (!folderPath) {
    return {
      success: false,
      error: 'No folder path provided',
      code: 'INVALID_PATH'
    };
  }

  try {
    // Verify folder exists first
    const verifyResult = await verifyFolder(folderPath);
    if (!verifyResult.success || !verifyResult.exists) {
      return {
        success: false,
        error: 'Folder does not exist or is not accessible',
        code: 'NOT_FOUND',
        path: folderPath
      };
    }

    // fs.readdir: Reads directory contents
    //   Inputs: Path string, options object
    //   Outputs: Promise resolving to array of item names
    const items = await fs.readdir(folderPath, { withFileTypes: true });
    
    // Build array of folder items with metadata
    const folderItems = [];
    
    for (const item of items) {
      const itemPath = path.join(folderPath, item.name);
      
      try {
        // Get item statistics
        const stats = await fs.stat(itemPath);
        
        folderItems.push({
          name: item.name,
          path: itemPath,
          type: stats.isDirectory() ? 'folder' : 'file',
          size: stats.size,
          modified: stats.mtime.getTime() // Timestamp in milliseconds
        });
      } catch (error) {
        // Skip items that can't be accessed
        continue;
      }
    }

    // Sort: folders first, then files, both alphabetically
    folderItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      path: folderPath,
      items: folderItems
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error listing folder',
      code: error.code || 'LIST_ERROR',
      path: folderPath
    };
  }
}

module.exports = {
  verifyFolder,
  createFolder,
  listFolders
};
