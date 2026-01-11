/**
 * install-manifest.js
 * 
 * Purpose: Helper script to install native messaging host manifest.
 * Role: Registers the native messaging host with Chrome on installation.
 * 
 * Platform-specific manifest locations:
 * - macOS: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
 * - Windows: Registry key HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const manifestName = 'com.downloadrouter.host.json';
const manifestTemplatePath = path.join(__dirname, manifestName);

/**
 * Installs native messaging host manifest for current platform.
 * 
 * Inputs:
 *   - companionExecutablePath: String absolute path to companion executable
 *   - extensionId: String Chrome extension ID
 * 
 * Outputs: Promise resolving to success status
 */
async function installManifest(companionExecutablePath, extensionId) {
  const platform = process.platform;

  try {
    // Read manifest template
    let manifestContent = await fs.readFile(manifestTemplatePath, 'utf8');
    
    // Replace placeholders
    manifestContent = manifestContent.replace(
      'COMPANION_EXECUTABLE_PATH',
      companionExecutablePath.replace(/\\/g, '\\\\') // Escape backslashes for JSON
    );
    manifestContent = manifestContent.replace(
      'YOUR_EXTENSION_ID',
      extensionId
    );

    // Parse and update manifest
    const manifest = JSON.parse(manifestContent);

    if (platform === 'darwin') {
      // macOS: Create manifest file in Chrome NativeMessagingHosts directory
      const manifestDir = path.join(
        os.homedir(),
        'Library/Application Support/Google/Chrome/NativeMessagingHosts'
      );
      
      // Create directory if it doesn't exist
      await fs.mkdir(manifestDir, { recursive: true });
      
      // Write manifest file
      const manifestPath = path.join(manifestDir, manifestName);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      
      return { success: true, path: manifestPath };
    } else if (platform === 'win32') {
      // Windows: Create registry entry
      // Try to use winreg if available, otherwise use PowerShell command
      try {
        const Registry = require('winreg');
        const regKey = new Registry({
          hive: Registry.HKCU,
          key: '\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.downloadrouter.host'
        });

        return new Promise((resolve, reject) => {
          regKey.set(Registry.DEFAULT_VALUE, Registry.REG_SZ, JSON.stringify(manifest), (err) => {
            if (err) {
              reject(err);
            } else {
              resolve({ success: true, path: regKey.key });
            }
          });
        });
      } catch (e) {
        // winreg not available - return instructions for manual installation
        throw new Error('Windows registry access requires winreg package. Use install-windows.ps1 script instead.');
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  installManifest
};
