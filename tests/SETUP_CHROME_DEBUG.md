# Setting Up Chrome DevTools MCP

This guide will help you:
1. Launch Chrome with remote debugging on your preferred profile
2. Configure Cursor's MCP server to connect to Chrome correctly

## Step 1: Launch Chrome with Remote Debugging

### Option A: Use the Launch Script (Recommended)

```bash
# Launch with Default profile
./launch-chrome-debug.sh Default

# Or with Profile 1
./launch-chrome-debug.sh "Profile 1"
```

### Option B: Manual Launch

Close Chrome completely, then run:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome" \
  --profile-directory="Default"
```

Replace `"Default"` with your profile name if different.

### Verify Remote Debugging is Working

Visit: http://127.0.0.1:9222/json

You should see JSON data with open tabs. If you see an error, Chrome isn't running with remote debugging.

## Step 2: Fix MCP Server Configuration

The MCP server is trying to run `npx chrome-devtools-mcp@latest` but can't find `npx` in its PATH.

### Solution: Update MCP Command in Cursor

1. Open Cursor Settings (Cmd+,)
2. Search for "MCP" or "chrome-devtools"
3. Find the Chrome DevTools MCP server configuration
4. Update the command from:
   ```
   npx chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222
   ```
   
   To one of these options:

   **Option 1: Use the wrapper script (Recommended)**
   ```
   /Users/Shared/Github-repo/chrome-devtools-mcp-wrapper.sh --browser-url=http://127.0.0.1:9222
   ```

   **Option 2: Use full path to npx**
   ```
   /opt/homebrew/bin/npx chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222
   ```

   **Option 3: Use full path to globally installed binary**
   ```
   /opt/homebrew/bin/chrome-devtools-mcp --browser-url=http://127.0.0.1:9222
   ```

### Alternative: System-Wide PATH Fix

If you want to fix the PATH system-wide (requires admin access):

```bash
# This adds /opt/homebrew/bin to system PATH
sudo bash -c 'echo "/opt/homebrew/bin" > /etc/paths.d/homebrew'

# Restart Cursor after running this
```

## Step 3: Verify Connection

1. Make sure Chrome is running with remote debugging (Step 1)
2. Restart Cursor completely
3. The MCP server should now connect successfully
4. You should see successful connection messages in the MCP logs

## Finding Your Chrome Profile

To see all your Chrome profiles:

```bash
ls -1 ~/Library/Application\ Support/Google/Chrome/*/Preferences 2>/dev/null | sed 's|.*Chrome/\([^/]*\)/Preferences|\1|'
```

Common profile names:
- `Default` - Your main profile
- `Profile 1`, `Profile 2`, etc. - Additional profiles

## Troubleshooting

### "Port 9222 already in use"
- Kill existing Chrome instances: `lsof -ti:9222 | xargs kill -9`
- Or use a different port: `--remote-debugging-port=9223`

### "npx not found" error persists
- Make sure you're using one of the command options above with full paths
- Verify npx is installed: `/opt/homebrew/bin/npx --version`
- Try the wrapper script approach

### MCP server still can't connect
- Verify Chrome is running: `lsof -i :9222`
- Check Chrome's remote debugging: http://127.0.0.1:9222/json
- Check Cursor's MCP logs for detailed error messages
