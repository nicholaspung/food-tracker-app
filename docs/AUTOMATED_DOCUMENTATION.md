# Automated Documentation System

This document explains how the automated documentation system works using Claude Code hooks and subagents.

## Overview

The system automatically ensures documentation stays up-to-date when pushing code to the main branch by:
1. **Intercepting** git push commands via Claude Code hooks
2. **Running** a specialized subagent to update documentation
3. **Generating** user-friendly changelogs for the "What's New" page

## How It Works

### 1. Git Push Detection

When you try to push to main (via Claude Code):

```bash
git push origin main
```

The **tool-call hook** (`.claude/hooks/tool-call.sh`) intercepts this and blocks it, prompting you to run:

```bash
/update-docs
```

### 2. Documentation Update Process

The `/update-docs` slash command triggers the **pre-push-documentation subagent** which:

1. **Analyzes Changes**
   - Runs `git diff` to see what changed
   - Identifies modified files
   - Reads commit messages for context

2. **Updates E2E Test Documentation** (`frontend/E2E_TESTING.md`)
   - Only if test files changed
   - Documents new test files
   - Updates test coverage stats
   - Adds new test pattern examples

3. **Updates API Access Documentation** (`docs/API_ACCESS.md`)
   - Documents PocketBase collections
   - Explains access rules (who can read/write/delete)
   - Creates clear tables for each collection

4. **Updates README.md**
   - Adds new features to Project Vision
   - Updates Tech Stack if major dependencies added
   - Only updates if significant changes occurred

5. **Generates What's New Entry** (`frontend/public/changelog.json`)
   - Creates user-friendly changelog entries
   - Auto-increments version number
   - Writes for non-technical users
   - Focuses on benefits, not implementation

### 3. Review and Commit

After the subagent completes:
1. Review the documentation changes
2. Commit them to your branch
3. Now you can push to main

## Setup Instructions

### Prerequisites

- Claude Code installed and configured
- Project using git
- Main branch named `main`

### Step 1: Enable Hooks

The hooks are already in `.claude/hooks/` but you need to enable them in Claude Code settings:

1. Open Claude Code settings (`.claude/settings.local.json`)
2. Add or update the hooks configuration:

```json
{
  "hooks": {
    "tool-call": ".claude/hooks/tool-call.sh"
  }
}
```

3. Restart Claude Code or reload the project

### Step 2: Test the Hook

Try pushing to main via Claude Code:

```
You: git push origin main
```

You should see a message blocking the push and asking you to run `/update-docs` first.

### Step 3: Update Documentation

Run the documentation update command:

```
You: /update-docs
```

Claude will analyze your changes and update all relevant documentation.

### Step 4: Commit and Push

After reviewing the documentation updates:

```
You: commit the documentation changes
You: git push origin main
```

## Usage Examples

### Example 1: After Adding a New Feature

```bash
# You just added a new "Journal Tracker" feature
# You've written E2E tests for it

You: I just finished the journal tracker feature. Ready to push to main.
Claude: Let me help you push to main. First, let's update the documentation.
[Claude runs /update-docs automatically]
Claude: I've updated:
  - E2E_TESTING.md with the new journal tests
  - README.md to include Journal Tracker in the vision
  - changelog.json with a user-friendly entry about the new feature

  Please review these changes.

You: Looks good, commit them
[Claude commits the documentation]

You: Now push to main
[Claude pushes successfully]
```

### Example 2: After API Changes

```bash
# You modified PocketBase collections to add new access rules

You: git push origin main
Claude: ⚠️ Documentation must be updated before pushing to main
        Please run: /update-docs

You: /update-docs
Claude: Analyzing changes...
        Updated docs/API_ACCESS.md with new collection rules
        No E2E changes detected
        No major feature changes for README
        No user-facing changes for What's New

        Documentation is ready for commit.

You: Commit the changes and push
[Claude commits and pushes]
```

## The "What's New" Page

Users can see all changes at `/whats-new` route in the application.

### Changelog Format

Location: `frontend/public/changelog.json`

```json
[
  {
    "version": "0.1.5",
    "date": "2025-10-12",
    "title": "Track Your Habits with Ease",
    "summary": "You can now track daily habits and set custom reminders for each one.",
    "features": [
      "Added habit tracker with customizable reminders",
      "Visual streak counter shows your progress"
    ],
    "improvements": [
      "Faster app startup time",
      "Smoother animations throughout"
    ],
    "fixes": [
      "Fixed issue where dates weren't saving correctly"
    ]
  }
]
```

### Writing Good Changelog Entries

**Do** ✅:
- Write for non-technical users
- Focus on benefits ("Track your habits" not "Added habits collection")
- Use simple, clear language
- Make it exciting but accurate
- Include what users will notice

**Don't** ❌:
- Use technical jargon ("Refactored authentication service")
- Document dependency updates ("Updated React to 19.1")
- Include internal changes users won't notice
- Be vague ("Various improvements")

## Subagent Details

### pre-push-documentation

Location: `.claude/subagents/pre-push-documentation.md`

**Purpose**: Automatically update all documentation before pushing to main

**Key Behaviors**:
- Reads git changes to understand what to document
- Updates multiple documentation files intelligently
- Generates user-friendly changelog entries
- Skips updates for internal-only changes

**When It Runs**:
- Via `/update-docs` slash command
- Manually via Task tool with subagent

**Output**:
- Summary of changes analyzed
- List of files updated
- Preview of changelog entry
- Next steps for user

## Files in the System

```
food-tracker-app/
├── .claude/
│   ├── hooks/
│   │   └── tool-call.sh              # Intercepts git push commands
│   ├── commands/
│   │   └── update-docs.md            # Slash command definition
│   └── subagents/
│       └── pre-push-documentation.md # Documentation update agent
├── docs/
│   ├── API_ACCESS.md                 # Auto-generated API docs
│   └── AUTOMATED_DOCUMENTATION.md    # This file
├── frontend/
│   ├── E2E_TESTING.md                # Auto-updated test docs
│   ├── public/
│   │   └── changelog.json            # Auto-generated changelog
│   └── src/
│       └── routes/
│           └── whats-new.tsx         # User-facing changelog page
└── README.md                         # Auto-updated project README
```

## Troubleshooting

### Hook Not Firing

**Problem**: Git push goes through without being blocked

**Solutions**:
1. Check `.claude/settings.local.json` has hooks configured
2. Ensure `.claude/hooks/tool-call.sh` is executable: `chmod +x .claude/hooks/tool-call.sh`
3. Restart Claude Code
4. Check you're pushing via Claude Code, not directly in terminal

### Subagent Not Found

**Problem**: `/update-docs` command doesn't work

**Solutions**:
1. Verify `.claude/commands/update-docs.md` exists
2. Verify `.claude/subagents/pre-push-documentation.md` exists
3. Restart Claude Code to reload commands
4. Check file permissions

### Documentation Not Updating

**Problem**: Subagent runs but doesn't update files

**Solutions**:
1. Check git status - are there changes to detect?
2. Ensure backend/frontend files were actually modified
3. Check if changes are "significant enough" (internal-only changes are skipped)
4. Review subagent output for error messages

### Changelog Not Appearing on Website

**Problem**: `/whats-new` route shows no entries

**Solutions**:
1. Check `frontend/public/changelog.json` exists and has entries
2. Ensure dev server restarted after changelog creation
3. Check browser console for fetch errors
4. Verify JSON format is correct

## Advanced Configuration

### Customizing the Hook

Edit `.claude/hooks/tool-call.sh` to change behavior:

```bash
# Block pushes to any branch
if [[ "$COMMAND" =~ ^git\ push ]]; then

# Block only "git push origin main" (default)
if [[ "$COMMAND" =~ ^git\ push.*main ]]; then

# Allow push but show warning
echo "⚠️ Consider updating docs with /update-docs"
exit 0  # Don't block
```

### Customizing Documentation Updates

Edit `.claude/subagents/pre-push-documentation.md` to change:
- Which files get updated
- Documentation format and style
- Changelog entry requirements
- Version numbering scheme

### Adding More Hooks

You can add other hooks for different events:

**user-prompt-submit** - Runs before user prompts are sent:
```bash
# .claude/hooks/user-prompt-submit.sh
# Could remind users to update tests
```

**Read Hook** - Runs after files are read:
```bash
# Could lint or analyze files automatically
```

See Claude Code docs for all available hooks.

## Benefits

✅ **Always Up-to-Date**: Documentation updates with code
✅ **No Manual Work**: Automated by Claude Code
✅ **User-Friendly**: What's New entries written for regular users
✅ **Consistent**: Same format every time
✅ **Prevents Mistakes**: Can't push without updating docs
✅ **Version History**: Complete changelog of all changes

## Integration with CI/CD

This system works alongside GitHub Actions:

1. **Local (Claude Code)**: Update documentation before push
2. **GitHub Actions**: Run tests and deploy

The GitHub Actions workflow (`.github/workflows/deploy.yml`) can also be enhanced to:
- Verify documentation is current
- Auto-generate changelog if missing
- Post What's New entries to social media
- Send notifications of new releases

See `.github/workflows/auto-documentation.yml` for an alternative approach using GitHub Actions + Claude API.

## Future Enhancements

Potential improvements:
- [ ] Auto-generate API docs from OpenAPI spec
- [ ] Create visual changelog with screenshots
- [ ] Send What's New emails to users
- [ ] Generate release notes for GitHub releases
- [ ] Track documentation coverage metrics
- [ ] Integrate with project management tools

## Support

If you encounter issues:
1. Check this documentation
2. Review subagent logs in Claude Code
3. Test hooks manually: `bash .claude/hooks/tool-call.sh`
4. Check Claude Code documentation: https://docs.claude.com/claude-code

## Summary

This automated documentation system ensures your docs stay current without manual effort:

1. **Hook** intercepts git push to main
2. **Slash command** triggers documentation update
3. **Subagent** intelligently updates all docs
4. **Review** changes before committing
5. **Push** to main with confidence

No more outdated documentation! 🎉
