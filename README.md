# Download Router Chrome Extension

A simple, intuitive Chrome extension to automatically route your downloads into specific subfolders based on rules you define, with a confirmation overlay for user control.

## Features

*   **Rule-Based Routing:** Create rules to sort downloads by:
    *   **Source Domain:** (e.g., files from `printables.com` go to `/3DPrinting/`).
    *   **File Extension Groups:** (e.g., `.exe`, `.msi` files go to `/SoftwareInstallers/`).
    *   **Pre-defined Groups:** Use built-in groups like Videos, Images, Documents, 3D Files, Software.
*   **Confirmation Overlay:** A floating popup appears for each download, showing the resolved path, with options to:
    *   Change location for this download only.
    *   Edit rules on the fly.
    *   Auto-save after 5 seconds if untouched.
*   **Conflict Resolution:** Set a preference for which rule to follow when both a domain and an extension rule match a download.
*   **Simple UI:** A clean and straightforward options page to manage your routing rules and groups.
*   **Syncs Across Devices:** Your rules and groups are saved using `chrome.storage.sync`, so they follow you across your Chrome profiles.

## How to Use

1.  **Install the Extension:** Load the extension into Chrome in developer mode.
2.  **Open Options:** Right-click the extension icon and select "Options", or open it from the extension's popup.
3.  **Add Rules:**
    *   Click "Add Rule".
    *   Choose a rule type: "Domain" or "Extension Group".
    *   **For Domain:** Enter the website domain (e.g., `thingiverse.com`).
    *   **For Extension Group:** Enter a comma-separated list of file extensions (e.g., `stl,obj,3mf`).
    *   Specify the destination folder name (e.g., `3D Models`).
4.  **Manage Groups:**
    *   Pre-seeded groups are available (Videos, Images, etc.).
    *   Add new groups or edit existing ones.
5.  **Set Tie-Breaker:** In the "Settings" section, choose your preferred action when a download matches both a domain and an extension rule.
6.  **Save:** Click the "Save" button.

When you download a file, a confirmation overlay will appear at the bottom-right, showing the suggested path. You can change it, edit rules, or let it auto-save.

## For the CV

This project demonstrates practical skills in:

*   **Chrome Extension Development:** Understanding of `manifest.json`, background scripts, options pages, popups, and the Chrome Extension API (`downloads`, `storage`, `notifications`, `windows`).
*   **JavaScript (ES6+):** Clean, modern JavaScript for handling logic, DOM manipulation, and asynchronous operations.
*   **HTML5 & CSS3:** Structuring and styling for a user-friendly interface, including responsive design for popups.
*   **User-Centric Design:** Focus on creating an intuitive and simple user experience to solve a common problem, with real-time feedback and control.
*   **Problem Solving:** Developing a clear and effective solution for organizing downloaded files, handling edge cases like conflicting rules.
*   **State Management:** Using Chrome's storage API for persistent, synced data across devices.
