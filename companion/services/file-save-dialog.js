/**
 * file-save-dialog.js
 * 
 * Platform: Cross-platform (macOS, Windows, Linux)
 * Purpose: Native OS Save As dialog using OS-level commands (no Electron).
 * Role: Opens native file save dialogs using platform-specific commands
 *       and returns the selected absolute file path.
 * 
 * Platform Support:
 * - macOS: Uses osascript (AppleScript) for native Save As dialog
 * - Windows: Uses PowerShell with System.Windows.Forms.SaveFileDialog
 * - Linux: Uses zenity (GNOME) or kdialog (KDE) for native dialogs
 * 
 * This approach eliminates Electron startup overhead, allowing instant responses.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { homedir } = require('os');

/**
 * Opens a native OS Save As dialog using OS commands and returns selected file path.
 * 
 * Inputs:
 *   - filename: String filename to pre-fill in dialog
 *   - defaultDirectory: Optional string absolute path to start dialog at
 * 
 * Outputs: Promise resolving to response object with selected file path or error
 */
async function showSaveAsDialog(filename, defaultDirectory = null) {
  console.error('showSaveAsDialog called:', { filename, defaultDirectory });
  const platform = process.platform;
  
  try {
    if (platform === 'darwin') {
      // macOS: Use osascript to show Save As dialog
      // Convert relative paths to absolute paths
      let resolvedDefaultDir = defaultDirectory;
      if (defaultDirectory && !path.isAbsolute(defaultDirectory)) {
        // Try resolving relative to home directory Downloads folder
        const downloadsPath = path.join(homedir(), 'Downloads', defaultDirectory);
        if (fs.existsSync(downloadsPath)) {
          resolvedDefaultDir = downloadsPath;
        } else if (fs.existsSync(path.join(homedir(), defaultDirectory))) {
          resolvedDefaultDir = path.join(homedir(), defaultDirectory);
        } else {
          // Just use Downloads as default
          resolvedDefaultDir = path.join(homedir(), 'Downloads');
        }
      } else if (!resolvedDefaultDir) {
        resolvedDefaultDir = path.join(homedir(), 'Downloads');
      }
      
      // Escape special characters in filename and path for AppleScript
      const escapedFilename = filename.replace(/"/g, '\\"');
      const escapedDir = resolvedDefaultDir.replace(/"/g, '\\"');
      
      // macOS Save As dialog using AppleScript
      // choose file name is a Standard Additions command (runs in current app context)
      const script = `
        set defaultName to "${escapedFilename}"
        set defaultLocation to POSIX file "${escapedDir}"
        try
          set theFile to choose file name with prompt "Save As:" default name defaultName default location defaultLocation
          return POSIX path of theFile
        on error errMsg
          return ""
        end try
      `.trim();
      
      console.error('Running AppleScript for Save As dialog...');
      console.error('Script:', script);
      
      try {
        const selectedPath = execSync(`osascript -e '${script}'`, {
          encoding: 'utf8',
          timeout: 60000, // 60 second timeout
          stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr
        }).trim();
        
        console.error('AppleScript returned:', selectedPath);
        
        if (selectedPath) {
          return {
            success: true,
            type: 'filePicked',
            filePath: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'No file selected or user cancelled',
            code: 'NO_SELECTION',
            type: 'filePicked'
          };
        }
      } catch (error) {
        console.error('AppleScript error:', error.message, error.stderr?.toString());
        // User cancelled returns status 1, but other errors might also
        // Check stderr for actual cancellation message
        const stderr = error.stderr ? error.stderr.toString() : '';
        const isCancelled = error.status === 1 || 
                           error.message.includes('User cancelled') || 
                           stderr.includes('User cancelled') ||
                           stderr.includes('cancel') ||
                           error.code === 'ETIMEDOUT';
        
        if (isCancelled) {
          return {
            success: false,
            error: 'User cancelled file save dialog',
            code: 'CANCELLED',
            type: 'filePicked'
          };
        }
        
        // For other errors (like GUI access denied), return error instead of throwing
        return {
          success: false,
          error: error.message || 'Failed to open Save As dialog',
          code: 'DIALOG_ERROR',
          type: 'filePicked',
          details: {
            status: error.status,
            code: error.code,
            stderr: stderr.substring(0, 200)
          }
        };
      }
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to show Save As dialog
      // Use SaveFileDialog for Save As functionality
      const escapedFilename = filename.replace(/"/g, '""');
      const escapedDir = defaultDirectory ? defaultDirectory.replace(/"/g, '""') : '';
      
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $saveDialog = New-Object System.Windows.Forms.SaveFileDialog
        $saveDialog.FileName = "${escapedFilename}"
        $saveDialog.Title = "Save As"
        $saveDialog.Filter = "All Files (*.*)|*.*"
        ${escapedDir ? `$saveDialog.InitialDirectory = "${escapedDir}"` : ''}
        if ($saveDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Output $saveDialog.FileName
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
            type: 'filePicked',
            filePath: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'User cancelled file save dialog',
            code: 'CANCELLED',
            type: 'filePicked'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: 'User cancelled file save dialog',
          code: 'CANCELLED',
          type: 'filePicked'
        };
      }
    } else {
      // Linux: Use zenity (GNOME) or kdialog (KDE) for Save As dialog
      const escapedFilename = filename.replace(/"/g, '\\"');
      const escapedDir = defaultDirectory ? defaultDirectory.replace(/"/g, '\\"') : '';
      
      // zenity --file-selection --save shows Save As dialog
      let command = null;
      if (escapedDir) {
        command = `zenity --file-selection --save --filename="${escapedDir}/${escapedFilename}" 2>/dev/null || kdialog --getsavefilename "${escapedDir}/${escapedFilename}" 2>/dev/null`;
      } else {
        command = `zenity --file-selection --save --filename="${escapedFilename}" 2>/dev/null || kdialog --getsavefilename "${escapedFilename}" 2>/dev/null`;
      }
      
      try {
        const selectedPath = execSync(command, {
          encoding: 'utf8',
          timeout: 60000,
          shell: true
        }).trim();
        
        if (selectedPath) {
          return {
            success: true,
            type: 'filePicked',
            filePath: selectedPath
          };
        } else {
          return {
            success: false,
            error: 'User cancelled file save dialog',
            code: 'CANCELLED',
            type: 'filePicked'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: 'User cancelled file save dialog',
          code: 'CANCELLED',
          type: 'filePicked'
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error opening Save As dialog',
      code: 'DIALOG_ERROR',
      type: 'filePicked'
    };
  }
}

module.exports = {
  showSaveAsDialog
};
