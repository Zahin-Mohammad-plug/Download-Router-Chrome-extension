# Chrome Web Store Listing (v2.2.0)

Copy-paste text for the developer dashboard. Store page: https://chromewebstore.google.com/detail/download-router/gbdficmkipoplmkhcdbdlfmjfpgbgjbn

## Store listing tab

**Name:** Download Router

**Category:** Productivity (Tools)

**Language:** English

**Short description** (same as the manifest `description`, max 132 characters):

> Sort downloads into folders by website, file name or type. A small card shows where each file goes and lets you change it.

**Detailed description:**

```
Stop digging through one giant Downloads folder.

Download Router saves each file into the right folder based on simple rules: where it came from, a word in its name, or its type. When a download starts, a small card on the page shows where it's going. Leave it and it saves in a few seconds, or pick another folder.

HOW RULES WORK
Rules are checked in order, and the first match wins:
1. Websites: github.com → Code (subdomains included; github.com/octocat can go somewhere else)
2. File names: anything with "invoice" → Invoices
3. File types: .zip files, or groups like Images, Documents, Videos, Archives, 3D Files, Software
4. Everything else: a default folder

THE DOWNLOAD CARD
• See the file and where it's going before it saves
• Click the folder to pick one you use, make a New Folder, or Rename the file
• Tick "Always save files from this site here" (or "all .zip files") and the rule is made for you
• Saves automatically after 3, 5 or 10 seconds. Hover to pause, ✕ to cancel the download
• Changed your mind after it saved? Pick a new folder and it's moved there

THE POPUP
• Your recent downloads. Click one to show it in its folder
• Where this site's downloads go, with one click to change it
• A switch to pause sorting

SETTINGS
One page that lists where everything goes, in the order it's checked. Edit or add websites, names and file types, and choose how long the card waits.

PRIVATE BY DESIGN
No accounts, no analytics, no servers. Your rules are stored in Chrome (and synced by Chrome if you use Chrome Sync). Nothing is sent to the developer.

GOOD TO KNOW
• Chrome only lets extensions save inside your Downloads folder, so your folders live there (Downloads/Code, Downloads/Invoices…). An optional companion app (see the website) lets you save anywhere on your computer and adds a native folder picker.
• On the New Tab page and chrome:// pages the card can't appear; downloads there are sorted straight away using your rules.

Open source: https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension
```

**Homepage URL:** https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension

**Support URL:** https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/issues

**Privacy policy URL:** https://github.com/Zahin-Mohammad-plug/Download-Router-Chrome-extension/blob/main/PRIVACY.md

## Screenshots

1280×800 PNG, light mode, no personal file names or paths. Use a clean Chrome profile with a few example rules (github.com → Code, "invoice" → Invoices, default file types on). Capture in this order; the first one shows up first in search.

| # | Shot | Caption |
|---|---|---|
| 1 | A download card on a GitHub repo page, mid-countdown: `project-main.zip · 2.4 MB · github.com`, "Save to Code", footnote "Your github.com rule". | See where every download goes before it's saved. |
| 2 | Same card with the folder menu open: Folders you use (Code ✓, Archives, Documents, Invoices), New Folder…, Rename File… | Pick a different folder in one click. |
| 3 | Card after picking "Archives": the tinted "Always save files from github.com here" row, checkbox ticked, arrow visible. | Tick "Always" and the rule is made for you. |
| 4 | Settings page: numbered 1 Websites (github.com → Code), 2 File names ("invoice" → Invoices), 3 File types (Images, Documents, Archives with switches, one off), 4 Everything else. | Simple rules, checked in order. The first match wins. |
| 5 | Popup open over a site: Recent list with 3–4 files and folders, one row hovered showing "Show in Finder", This site line with Change, switch on. | Find recent downloads and change this site's folder from the toolbar. |

Optional small promo tile (440×280): app tile + "Download Router" + "Every download in the right folder."

## Privacy practices tab

### Single purpose

> Download Router saves the user's downloads into folders they choose, based on rules for the website a file came from, words in its file name, or its file type, and shows a small card so the user can see and change the destination before the file is saved.

### Permission justifications

**downloads**
> Core feature. Used to choose the folder and file name for each download (onDeterminingFilename), cancel a download when the user clicks ✕ on the card, show a finished download in its folder from the popup, and, when the user picks a new folder after Chrome already saved the file, download it again into that folder and remove the first copy.

**storage**
> Saves the user's rules (websites, file-name words, file types, folders) and settings (card on/off, countdown length, on/off switch) with chrome.storage.sync, and the recent-downloads list for the popup with chrome.storage.local. Nothing leaves the browser except through the user's own Chrome Sync.

**notifications**
> Shows a local Chrome notification when a file the user asked to relocate has been moved, or when it couldn't be moved and where it is instead.

**nativeMessaging**
> Talks to the optional Download Router Companion app on the user's own computer, only if they installed it. It opens the system folder picker and moves files to folders outside Downloads, which Chrome extensions can't do on their own. The communication is local; no network is involved.

**scripting**
> Adds the extension's own content script (the download card) to tabs that were already open when the extension was installed or updated, so the card works there without the user reloading every page. It injects only the extension's packaged files, never remote code.

**Host permission (`<all_urls>`)**
> The download card has to appear on whatever website the user downloads from, and the extension can't know those sites in advance. The content script only shows the card and reads the current site's address so site rules can be matched and created. It does not read or change page content otherwise, and nothing is sent anywhere.

### Remote code

> No, I am not using remote code. All JavaScript is packaged in the extension. No eval, no new Function, no external scripts.

### Data usage

What user data do you plan to collect from users now or in the future? **None of the categories are checked.**

- Personally identifiable information: No
- Health information: No
- Financial and payment information: No
- Authentication information: No
- Personal communications: No
- Location: No
- Web history: No
- User activity: No
- Website content: No

(The extension looks at a download's URL, file name and the current site's address to pick a folder, and keeps a recent-downloads list for the popup, but all of this stays on the user's device and is never sent to the developer or anyone else, so it isn't "collected" under the store's definition. PRIVACY.md explains this.)

### Certifications (all checked)

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Distribution

- Visibility: Public
- Regions: All regions
- Staged rollout: not available under 10,000 users; the release goes to everyone once approved

## Notes for the reviewer (optional field)

```
2.2.0 replaces the download overlay with a simpler card, popup and settings page.
Permissions: removed "tabs" and "activeTab"; added "scripting", used only to add the extension's own content script (content.js, lib/validation.js) to tabs that were already open at install/update.
Test: install, click "Try It" on the settings page that opens; a sample PDF downloads and the card appears. Or download any file from a website.
The optional companion app is not required for review.
```
