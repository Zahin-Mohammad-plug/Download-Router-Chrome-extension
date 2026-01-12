/**
 * file-mover.js
 * 
 * Platform: Cross-platform (macOS, Windows, Linux)
 * Purpose: Post-download file moving service.
 * Role: Moves files after Chrome downloads them to route to absolute paths
 *       outside the Downloads directory.
 * 
 * Platform Support:
 * - Uses Node.js fs.rename which is cross-platform
 * - Path normalization handles both forward slashes (Unix) and backslashes (Windows)
 * - File conflict resolution works identically on all platforms
 * - Creates destination folders with platform-appropriate permissions
 * 
 * Key Responsibilities:
 * - Move files from Downloads to target absolute paths
 * - Create destination folders if needed
 * - Handle file conflicts (rename if exists)
 * - Provide detailed error reporting
 */

const fs = require('fs').promises;
const path = require('path');
const folderOperations = require('./folder-operations');

/**
 * Moves a file from source to destination path.
 * Creates destination folder if it doesn't exist.
 * 
 * Inputs:
 *   - sourcePath: String absolute path to source file
 *   - destinationPath: String absolute path to destination (file or folder)
 * 
 * Outputs: Promise resolving to response object indicating success or error
 * 
 * External Dependencies:
 *   - fs.rename: Node.js file system API for moving files
 *   - fs.stat: Node.js file system API for getting file stats
 *   - path.dirname: Node.js path API for getting parent directory
 *   - path.basename: Node.js path API for getting filename
 *   - folderOperations: Service for folder verification and creation
 */
async function moveFile(sourcePath, destinationPath) {
  console.error('moveFile called:', { sourcePath, destinationPath });
  
  if (!sourcePath || !destinationPath) {
    console.error('moveFile: Invalid paths');
    return {
      success: false,
      error: 'Source and destination paths required',
      code: 'INVALID_PATHS'
    };
  }

  try {
    // Verify source file exists
    // fs.access: Checks if file exists
    //   Inputs: Path string, mode flags (fs.constants.F_OK)
    //   Outputs: Promise (rejects if not accessible)
    await fs.access(sourcePath, fs.constants.F_OK);
    
    const sourceStats = await fs.stat(sourcePath);
    if (!sourceStats.isFile()) {
      return {
        success: false,
        error: 'Source path is not a file',
        code: 'NOT_FILE',
        source: sourcePath
      };
    }

    // Determine final destination path
    let finalDestination = destinationPath;
    
    // If destination is a folder, append source filename
    try {
      const destStats = await fs.stat(destinationPath);
      if (destStats.isDirectory()) {
        // path.basename: Extracts filename from path
        //   Inputs: Path string
        //   Outputs: Filename string
        const filename = path.basename(sourcePath);
        finalDestination = path.join(destinationPath, filename);
      }
    } catch (error) {
      // Destination doesn't exist - assume it's a file path
      // Ensure parent directory exists
      const parentDir = path.dirname(finalDestination);
      const parentExists = await folderOperations.verifyFolder(parentDir);
      
      if (!parentExists.success || !parentExists.exists) {
        // Create parent directory
        const createResult = await folderOperations.createFolder(parentDir);
        if (!createResult.success) {
          return {
            success: false,
            error: 'Failed to create destination folder',
            code: 'CREATE_FOLDER_ERROR',
            destination: destinationPath
          };
        }
      }
    }

    // Handle file conflict: rename with incrementing number
    // path.dirname: Gets parent directory path
    //   Inputs: Path string
    //   Outputs: Parent directory string
    // path.basename: Gets filename
    //   Inputs: Path string, optional extension to remove
    //   Outputs: Filename string
    // path.extname: Gets file extension
    //   Inputs: Path string
    //   Outputs: Extension string (including dot)
    finalDestination = await resolveDestinationPath(finalDestination);

    // Move file
    // fs.rename: Moves/renames file or directory
    //   Inputs: Source path, destination path
    //   Outputs: Promise (rejects if move fails)
    console.error('moveFile: Moving', sourcePath, 'to', finalDestination);
    await fs.rename(sourcePath, finalDestination);

    console.error('moveFile: Success');
    return {
      success: true,
      moved: true,
      source: sourcePath,
      destination: finalDestination
    };
  } catch (error) {
    console.error('moveFile: Error:', error.message, error.code);
    return {
      success: false,
      moved: false,
      error: error.message || 'Error moving file',
      code: error.code || 'MOVE_ERROR',
      source: sourcePath,
      destination: destinationPath
    };
  }
}

/**
 * Resolves destination path, handling file conflicts by appending numbers.
 * 
 * Inputs:
 *   - destinationPath: String absolute path to destination file
 * 
 * Outputs: Promise resolving to available destination path string
 * 
 * External Dependencies:
 *   - fs.access: Node.js file system API for checking existence
 *   - path.dirname: Node.js path API for getting parent directory
 *   - path.basename: Node.js path API for getting filename
 *   - path.extname: Node.js path API for getting extension
 */
async function resolveDestinationPath(destinationPath) {
  try {
    // Check if destination already exists
    await fs.access(destinationPath, fs.constants.F_OK);
    
    // File exists, find available name with number suffix
    const dir = path.dirname(destinationPath);
    const basename = path.basename(destinationPath, path.extname(destinationPath));
    const ext = path.extname(destinationPath);
    
    let counter = 1;
    let newPath;
    
    do {
      newPath = path.join(dir, `${basename} (${counter})${ext}`);
      counter++;
      
      try {
        await fs.access(newPath, fs.constants.F_OK);
        // File exists, try next number
      } catch (error) {
        // File doesn't exist, use this path
        return newPath;
      }
    } while (counter < 1000); // Safety limit
    
    // Fallback: use timestamp
    const timestamp = Date.now();
    return path.join(dir, `${basename} (${timestamp})${ext}`);
  } catch (error) {
    // File doesn't exist, use original path
    return destinationPath;
  }
}

module.exports = {
  moveFile
};
