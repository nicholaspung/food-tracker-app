#!/bin/bash

# Claude Code tool-call hook
# This intercepts Bash tool calls and triggers documentation updates for git pushes to main

# The hook receives JSON input on stdin with tool call details
# Example: {"tool": "Bash", "parameters": {"command": "git push origin main"}}

# Read the JSON input
INPUT=$(cat)

# Extract tool name and command using basic string matching
TOOL=$(echo "$INPUT" | grep -o '"tool":"[^"]*"' | cut -d'"' -f4)
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | sed 's/"command":"//;s/"$//')

# Check if this is a git push to main
if [[ "$TOOL" == "Bash" ]] && [[ "$COMMAND" =~ ^git\ push.*main ]]; then
  echo "🔍 Detected git push to main branch"
  echo "⚠️  BLOCKING: Documentation must be updated before pushing to main"
  echo ""
  echo "Please run the following command first:"
  echo "  /update-docs"
  echo ""
  echo "This will:"
  echo "  - Update E2E test documentation"
  echo "  - Update API access documentation"
  echo "  - Update README with new features"
  echo "  - Generate What's New changelog entry"
  echo ""
  echo "After documentation is updated, you can push to main."

  # Return status 1 to block the tool call
  exit 1
fi

# Allow all other tool calls
exit 0
