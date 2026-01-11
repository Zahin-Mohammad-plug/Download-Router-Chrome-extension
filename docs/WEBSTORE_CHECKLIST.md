# Chrome Web Store Submission Checklist

Use this checklist before submitting the extension to Chrome Web Store.

## Pre-Submission Verification

### Manifest Validation
- [x] `extension/manifest.json` is valid JSON
- [x] `manifest_version: 3` (required)
- [x] All required fields present (name, version, description)
- [x] No references to non-existent files (overlay.html removed)
- [x] All referenced files exist

### File Structure
- [x] All icons present in `extension/icons/` (16, 32, 48, 128)
- [x] All HTML files present in `extension/` (popup.html, options.html)
- [x] All JavaScript files present in `extension/` (background.js, content.js, popup.js, options.js)
- [x] All CSS files present in `extension/` (popup.css, options.css, overlay.css)
- [x] All library files present in `extension/lib/` (native-messaging-client.js)

### Permissions Justification
- [x] `downloads` - Required for download routing
- [x] `storage` - Required for saving rules and settings
- [x] `notifications` - Required for fallback notification system
- [x] `activeTab` - Required for overlay injection
- [x] `nativeMessaging` - Required for companion app communication
- [x] `host_permissions: <all_urls>` - Required for overlay injection on any site

### Code Quality
- [x] No console.error statements (only console.log for debugging)
- [x] Error handling implemented
- [x] No hardcoded paths or IDs
- [x] All dependencies are standard Chrome APIs

### Documentation
- [x] README.md updated
- [x] Installation instructions clear
- [x] Privacy policy (if required)
- [x] Terms of service (if required)

## Testing Checklist

### Basic Functionality
- [ ] Extension loads without errors
- [ ] Popup opens correctly
- [ ] Options page works
- [ ] Service worker initializes
- [ ] No console errors

### Download Routing
- [ ] Domain rules work
- [ ] File type rules work
- [ ] Overlay appears on downloads
- [ ] Files route to correct folders
- [ ] Countdown timer works

### Companion App Integration
- [ ] Companion app detection works
- [ ] Folder picker opens (if companion installed)
- [ ] Native messaging communication works
- [ ] File moving works (if companion installed)

## Packing Instructions

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Pack extension"
4. Select the `extension/` directory
5. Leave "Private key" empty (first time only)
6. Click "Pack Extension"
7. Test the packed `.crx` file before submission

## Submission Notes

- Web Store will assign a permanent extension ID upon first submission
- Extension ID will be visible in developer dashboard after submission
- Update companion app installation instructions with Web Store extension ID
- Test companion app installation with Web Store extension ID

## Post-Submission

After submission is approved:
1. Note the assigned extension ID from developer dashboard
2. Update companion app installation documentation
3. Create release with companion app installer
4. Update README with Web Store link
