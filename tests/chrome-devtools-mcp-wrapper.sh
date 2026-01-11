#!/bin/bash

# Wrapper script for chrome-devtools-mcp that ensures PATH is set correctly
# This ensures npx and node are available when MCP server spawns the process

# Source shell profile to get PATH
if [ -f ~/.zshrc ]; then
    source ~/.zshrc
elif [ -f ~/.zprofile ]; then
    source ~/.zprofile
fi

# Explicitly add Homebrew bin to PATH if not present
if [[ ":$PATH:" != *":/opt/homebrew/bin:"* ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found in PATH" >&2
    echo "Current PATH: $PATH" >&2
    exit 1
fi

# Run chrome-devtools-mcp with all arguments passed through
exec npx chrome-devtools-mcp@latest "$@"
