#!/bin/bash
# Auto-detect Chrome Extension ID for Download Router
# Platform: macOS ONLY (reads from Chrome preferences file)

# macOS Chrome preferences location
CHROME_PREFS="$HOME/Library/Application Support/Google/Chrome/Default/Preferences"

if [ ! -f "$CHROME_PREFS" ]; then
  echo "Error: Chrome preferences not found at $CHROME_PREFS" >&2
  echo "Make sure Chrome is installed and has been opened at least once." >&2
  exit 1
fi

# Try to find Download Router extension ID
# Extensions are stored in preferences.extensions.settings
# We look for an extension with name matching "Download Router"

EXTENSION_ID=$(python3 << 'PYTHON'
import json
import sys
import os

prefs_path = os.path.expanduser("$HOME/Library/Application Support/Google/Chrome/Default/Preferences")

try:
    with open(prefs_path, 'r', encoding='utf-8') as f:
        prefs = json.load(f)
    
    extensions = prefs.get('extensions', {}).get('settings', {})
    
    # Look for Download Router extension
    for ext_id, ext_data in extensions.items():
        name = ext_data.get('manifest', {}).get('name', '')
        if 'download router' in name.lower() or 'router' in name.lower():
            # Check if it's enabled
            state = ext_data.get('state', 0)
            if state == 1:  # Enabled
                print(ext_id)
                sys.exit(0)
    
    # If not found, list all extensions for debugging
    print("", file=sys.stderr)
    print("Download Router extension not found in Chrome.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Installed extensions:", file=sys.stderr)
    for ext_id, ext_data in extensions.items():
        name = ext_data.get('manifest', {}).get('name', 'Unknown')
        state = ext_data.get('state', 0)
        state_name = "enabled" if state == 1 else "disabled"
        print(f"  {ext_id[:8]}... - {name} ({state_name})", file=sys.stderr)
    
    sys.exit(1)
except Exception as e:
    print(f"Error reading Chrome preferences: {e}", file=sys.stderr)
    sys.exit(1)
PYTHON
)

if [ -n "$EXTENSION_ID" ] && [ ${#EXTENSION_ID} -eq 32 ]; then
  echo "$EXTENSION_ID"
  exit 0
else
  exit 1
fi
