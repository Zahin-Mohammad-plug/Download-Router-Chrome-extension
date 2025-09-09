# Download Router Chrome Extension

A simple, intuitive Chrome extension to automatically route your downloads into specific subfolders based on rules you define.

## Features

*   **Rule-Based Routing:** Create rules to sort downloads by:
    *   **Source Domain:** (e.g., files from `printables.com` go to `/3DPrinting/`).
    *   **File Extension Groups:** (e.g., `.exe`, `.msi` files go to `/SoftwareInstallers/`).
*   **Conflict Resolution:** Set a preference for which rule to follow when both a domain and an extension rule match a download.
*   **Simple UI:** A clean and straightforward options page to manage your routing rules.
*   **Syncs Across Devices:** Your rules are saved using `chrome.storage.sync`, so they follow you across your Chrome profiles.

## How to Use

1.  **Install the Extension:** Load the extension into Chrome.
2.  **Open Options:** Right-click the extension icon and select "Options", or open it from the extension's popup.
3.  **Add Rules:**
    *   Click "Add Rule".
    *   Choose a rule type: "Domain" or "Extension Group".
    *   **For Domain:** Enter the website domain (e.g., `thingiverse.com`).
    *   **For Extension Group:** Enter a comma-separated list of file extensions (e.g., `stl,obj,3mf`).
    *   Specify the destination folder name (e.g., `3D Models`).
4.  **Set Tie-Breaker:** In the "Settings" section, choose your preferred action when a download matches both a domain and an extension rule.
5.  **Save:** Click the "Save" button.

Your downloads will now be automatically saved to the folders you specified!

## For the CV

This project demonstrates practical skills in:

*   **Chrome Extension Development:** Understanding of `manifest.json`, background scripts, options pages, and the Chrome Extension API (`downloads`, `storage`, `notifications`).
*   **JavaScript (ES6+):** Clean, modern JavaScript for handling logic and DOM manipulation.
*   **HTML5 & CSS3:** Structuring and styling for a user-friendly interface.
*   **User-Centric Design:** Focus on creating an intuitive and simple user experience to solve a common problem.
*   **Problem Solving:** Developing a clear and effective solution for organizing downloaded files.
