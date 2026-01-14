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
      // Windows: Use modern IFileOpenDialog for folder picking (same style as Save As dialog)
      // This provides the modern Windows 10/11 file dialog experience
      const scriptsDir = path.join(__dirname, '..', 'scripts');
      const scriptPath = path.join(scriptsDir, 'folder-picker.ps1');
      
      // Ensure scripts directory exists
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }
      
      // Create PowerShell script that uses modern IFileOpenDialog via COM
      // This gives the same dialog as the Save As dialog shown in Chrome
      const scriptContent = `
# Modern Folder Picker using IFileOpenDialog (Windows Vista+)
# Provides the same UI as Chrome's Save As dialog

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogInternal { }

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileOpenDialog {
    [PreserveSig] int Show([In] IntPtr hwndOwner);
    [PreserveSig] int SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
    [PreserveSig] int SetFileTypeIndex([In] uint iFileType);
    [PreserveSig] int GetFileTypeIndex(out uint piFileType);
    [PreserveSig] int Advise([In] IntPtr pfde, out uint pdwCookie);
    [PreserveSig] int Unadvise([In] uint dwCookie);
    [PreserveSig] int SetOptions([In] uint fos);
    [PreserveSig] int GetOptions(out uint pfos);
    [PreserveSig] int SetDefaultFolder([In] IShellItem psi);
    [PreserveSig] int SetFolder([In] IShellItem psi);
    [PreserveSig] int GetFolder(out IShellItem ppsi);
    [PreserveSig] int GetCurrentSelection(out IShellItem ppsi);
    [PreserveSig] int SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
    [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    [PreserveSig] int SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    [PreserveSig] int SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
    [PreserveSig] int SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    [PreserveSig] int GetResult(out IShellItem ppsi);
    [PreserveSig] int AddPlace([In] IShellItem psi, int fdap);
    [PreserveSig] int SetDefaultExtension([In, MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    [PreserveSig] int Close([In] int hr);
    [PreserveSig] int SetClientGuid([In] ref Guid guid);
    [PreserveSig] int ClearClientData();
    [PreserveSig] int SetFilter([In] IntPtr pFilter);
    [PreserveSig] int GetResults(out IntPtr ppenum);
    [PreserveSig] int GetSelectedItems(out IntPtr ppsai);
}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellItem {
    [PreserveSig] int BindToHandler([In] IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, out IntPtr ppv);
    [PreserveSig] int GetParent(out IShellItem ppsi);
    [PreserveSig] int GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    [PreserveSig] int GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
    [PreserveSig] int Compare([In] IShellItem psi, [In] uint hint, out int piOrder);
}

public class FolderPicker {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [In] string pszPath,
        [In] IntPtr pbc,
        [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [Out, MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    public static string PickFolder(string startPath) {
        var dialog = (IFileOpenDialog)new FileOpenDialogInternal();
        
        // FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_NOCHANGEDIR = 0x8
        dialog.SetOptions(0x20 | 0x40 | 0x8);
        dialog.SetTitle("Select Download Folder");
        dialog.SetOkButtonLabel("Select Folder");
        
        // Set initial folder if provided
        if (!string.IsNullOrEmpty(startPath) && System.IO.Directory.Exists(startPath)) {
            try {
                IShellItem startItem;
                SHCreateItemFromParsingName(startPath, IntPtr.Zero, 
                    typeof(IShellItem).GUID, out startItem);
                dialog.SetFolder(startItem);
            } catch { }
        }
        
        int hr = dialog.Show(IntPtr.Zero);
        if (hr == 0) {
            IShellItem item;
            dialog.GetResult(out item);
            string path;
            item.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
            return path;
        }
        return null; // Cancelled
    }
}
'@ -ReferencedAssemblies System.Runtime.InteropServices

$startPath = if ($args.Count -gt 0 -and $args[0] -ne "" -and $args[0] -ne "null") { $args[0] } else { $null }
$result = [FolderPicker]::PickFolder($startPath)
if ($result) {
    Write-Output $result
} else {
    Write-Output "CANCELLED"
}
`.trim();
      
      fs.writeFileSync(scriptPath, scriptContent, 'utf8');
      
      try {
        const startPathArg = startPath && startPath !== 'null' ? `"${startPath}"` : '""';
        const selectedPath = execSync(
          `powershell -ExecutionPolicy Bypass -File "${scriptPath}" ${startPathArg}`,
          {
            encoding: 'utf8',
            timeout: 120000, // 2 minute timeout for user interaction
            windowsHide: false // Show the dialog
          }
        ).trim();
        
        if (selectedPath && selectedPath !== 'CANCELLED') {
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
        // Check if it's a timeout or actual error
        if (error.killed) {
          return {
            success: false,
            error: 'Folder picker timed out',
            code: 'TIMEOUT',
            type: 'folderPicked'
          };
        }
        return {
          success: false,
          error: error.message || 'User cancelled folder selection',
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
