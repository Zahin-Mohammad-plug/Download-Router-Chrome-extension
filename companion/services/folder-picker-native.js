/**
 * folder-picker-native.js
 * 
 * Purpose: Native OS folder picker using OS-level commands (no Electron).
 * Role: Opens native folder selection dialogs using macOS osascript/Windows PowerShell
 *       and returns the selected absolute folder path.
 * 
 * This approach eliminates Electron startup overhead, allowing instant responses.
 */

const { execSync } = require('child_process');
const path = require('path');

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
      const startPathArg = startPath ? `default location "${startPath}"` : '';
      const script = `
        set theFolder to choose folder with prompt "Select Download Folder" ${startPathArg}
        return POSIX path of theFolder
      `.trim();
      
      try {
        const selectedPath = execSync(`osascript -e '${script}'`, {
          encoding: 'utf8',
          timeout: 60000 // 60 second timeout
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
        // User cancelled or timeout
        if (error.status === 1 || error.message.includes('User cancelled')) {
          return {
            success: false,
            error: 'User cancelled folder selection',
            code: 'CANCELLED',
            type: 'folderPicked'
          };
        }
        throw error;
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
