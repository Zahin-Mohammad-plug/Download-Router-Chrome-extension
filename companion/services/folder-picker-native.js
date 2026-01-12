/**
 * folder-picker-native.js
 * 
 * Platform: Cross-platform (macOS, Windows, Linux)
 * Purpose: Native OS folder picker using OS-level commands (no Electron).
 * Role: Opens native folder selection dialogs using platform-specific commands
 *       and returns the selected absolute folder path.
 * 
 * Platform Support:
 * - macOS: Uses osascript (AppleScript) for native Finder dialog
 * - Windows: Uses PowerShell with System.Windows.Forms.FolderBrowserDialog
 * - Linux: Uses zenity (GNOME) or kdialog (KDE) for native dialogs
 * 
 * This approach eliminates Electron startup overhead, allowing instant responses.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { homedir } = require('os');

/**
 * Opens a native OS folder picker dialog using OS commands and returns selected path.
 * 
 * Inputs:
 *   - startPath: Optional string absolute path to start dialog at
 * 
 * Outputs: Promise resolving to response object with selected path or error
 */
async function pickFolder(startPath = null) {
  const platform = process.platform;
  
  try {
    if (platform === 'darwin') {
      // macOS: Use osascript to show folder picker
      // Convert relative paths to absolute paths (osascript needs absolute or aliases)
      let resolvedStartPath = startPath;
      if (startPath && !path.isAbsolute(startPath)) {
        // Try resolving relative to home directory Downloads folder
        const downloadsPath = path.join(homedir(), 'Downloads', startPath);
        if (fs.existsSync(downloadsPath)) {
          resolvedStartPath = downloadsPath;
        } else if (fs.existsSync(path.join(homedir(), startPath))) {
          resolvedStartPath = path.join(homedir(), startPath);
        } else {
          // Just use Downloads as default
          resolvedStartPath = path.join(homedir(), 'Downloads');
        }
      } else if (!resolvedStartPath) {
        resolvedStartPath = path.join(homedir(), 'Downloads');
      }
      
      const startPathArg = resolvedStartPath ? `default location "${resolvedStartPath}"` : '';
      const script = `
        set theFolder to choose folder with prompt "Select Download Folder" ${startPathArg}
        return POSIX path of theFolder
      `.trim();
      
      try {
        const selectedPath = execSync(`osascript -e '${script}'`, {
          encoding: 'utf8',
          timeout: 60000, // 60 second timeout
          stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr
        }).trim();
        
        if (selectedPath) {
          return {
            success: true,
            type: 'folderPicked',
            path: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'No folder selected',
            code: 'NO_SELECTION',
            type: 'folderPicked'
          };
        }
      } catch (error) {
        // User cancelled returns status 1, but other errors might also
        // Check stderr for actual cancellation message
        const stderr = error.stderr ? error.stderr.toString() : '';
        const isCancelled = error.status === 1 || 
                           error.message.includes('User cancelled') || 
                           stderr.includes('User cancelled') ||
                           stderr.includes('cancel');
        
        if (isCancelled) {
          return {
            success: false,
            error: 'User cancelled folder selection',
            code: 'CANCELLED',
            type: 'folderPicked'
          };
        }
        
        // For other errors (like GUI access denied), return error instead of throwing
        return {
          success: false,
          error: error.message || 'Failed to open folder picker',
          code: 'DIALOG_ERROR',
          type: 'folderPicked',
          details: {
            status: error.status,
            code: error.code,
            stderr: stderr.substring(0, 200)
          }
        };
      }
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to show folder picker
      // This requires .NET Framework
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
        $folderBrowser.Description = "Select Download Folder"
        ${startPath ? `$folderBrowser.SelectedPath = "${startPath}"` : ''}
        if ($folderBrowser.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Output $folderBrowser.SelectedPath
        }
      `;
      
      try {
        const selectedPath = execSync(`powershell -Command "${script}"`, {
          encoding: 'utf8',
          timeout: 60000
        }).trim();
        
        if (selectedPath) {
          return {
            success: true,
            type: 'folderPicked',
            path: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'User cancelled folder selection',
            code: 'CANCELLED',
            type: 'folderPicked'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: 'User cancelled folder selection',
          code: 'CANCELLED',
          type: 'folderPicked'
        };
      }
    } else {
      // Linux: Try zenity (GNOME) or kdialog (KDE)
      let command = null;
      if (startPath) {
        command = `zenity --file-selection --directory --filename="${startPath}" 2>/dev/null || kdialog --getexistingdirectory "${startPath}" 2>/dev/null`;
      } else {
        command = `zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`;
      }
      
      try {
        const selectedPath = execSync(command, {
          encoding: 'utf8',
          timeout: 60000
        }).trim();
        
        if (selectedPath) {
          return {
            success: true,
            type: 'folderPicked',
            path: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'User cancelled folder selection',
            code: 'CANCELLED',
            type: 'folderPicked'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: 'User cancelled folder selection',
          code: 'CANCELLED',
          type: 'folderPicked'
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error opening folder picker',
      code: 'DIALOG_ERROR',
      type: 'folderPicked'
    };
  }
}

module.exports = {
  pickFolder
};
