# Quick Start: Automated Documentation

## TL;DR

When pushing to main via Claude Code, you'll be prompted to run `/update-docs` first. This automatically updates all documentation.

## How to Use

### Step 1: Make Your Changes

Write code, add features, fix bugs - whatever you need to do.

### Step 2: Try to Push

```
You: git push origin main
```

### Step 3: You'll Be Blocked

Claude Code will show:

```
🔍 Detected git push to main branch
⚠️  BLOCKING: Documentation must be updated before pushing to main

Please run the following command first:
  /update-docs
```

### Step 4: Run the Documentation Update

```
You: /update-docs
```

Claude will:
- Analyze your changes
- Update E2E test docs (if tests changed)
- Update API docs (if backend changed)
- Update README (if major features added)
- Create What's New entry (for user-facing changes)

### Step 5: Review and Commit

```
You: Review the documentation changes
Claude: [Shows you what was updated]

You: Looks good, commit the changes
Claude: [Commits documentation]

You: Now push to main
Claude: [Pushes successfully]
```

## What Gets Updated

### E2E Test Documentation
**File**: `frontend/E2E_TESTING.md`
**When**: Tests in `frontend/e2e/` changed
**Content**: Test coverage, new test files, testing patterns

### API Access Documentation
**File**: `docs/API_ACCESS.md`
**When**: Backend or collections changed
**Content**: Who can access what in each PocketBase collection

### Project README
**File**: `README.md`
**When**: Significant features added
**Content**: Updated feature list, new dependencies

### What's New Changelog
**File**: `frontend/public/changelog.json`
**When**: User-facing changes made
**Content**: User-friendly description of changes
**Visible**: At `/whats-new` route in the app

## Examples

### Example 1: Added New Feature

```
You: I just added a habit tracker feature with E2E tests. Push to main.

Claude: Let me check... I see you're trying to push to main.
        Please run /update-docs first.

You: /update-docs

Claude: Analyzing changes...
        ✓ Updated E2E_TESTING.md with habit tracker tests
        ✓ Updated README with habit tracker in Project Vision
        ✓ Created changelog entry v0.1.6: "Track Your Habits with Ease"

You: Perfect! Commit and push.

Claude: [Commits docs, pushes to main successfully]
```

### Example 2: Backend API Changes

```
You: Modified PocketBase collections to add invite_codes. Push to main.

Claude: Please run /update-docs first.

You: /update-docs

Claude: ✓ Created docs/API_ACCESS.md documenting invite_codes collection access rules
        ✓ No E2E test changes detected
        ✓ No major README changes needed
        ✓ Created changelog entry about invite system

You: Commit and push

Claude: [Done]
```

### Example 3: Internal Refactoring

```
You: Refactored authentication service. Push to main.

Claude: Please run /update-docs first.

You: /update-docs

Claude: Analyzing changes...
        No user-facing changes detected.
        This appears to be internal refactoring.
        No documentation updates needed.

You: Great, push to main

Claude: [Pushes successfully]
```

## Troubleshooting

### Hook Not Firing

**Problem**: Push goes through without being blocked

**Fix**: Restart Claude Code to reload hooks

### Can't Run /update-docs

**Problem**: Command not found

**Fix**: Check `.claude/commands/update-docs.md` exists, then restart Claude Code

### Docs Not Updating

**Problem**: Command runs but nothing changes

**Fix**: Check if your changes are actually significant enough to warrant docs. Internal changes are automatically skipped.

## Manual Override

If you absolutely need to push without updating docs (emergency hotfix):

1. Push directly from terminal (outside Claude Code)
2. OR disable the hook temporarily in `.claude/settings.local.json`

## See Also

- Full Documentation: [AUTOMATED_DOCUMENTATION.md](./AUTOMATED_DOCUMENTATION.md)
- Subagent Details: [.claude/subagents/pre-push-documentation.md](../.claude/subagents/pre-push-documentation.md)
- What's New Page: Visit `/whats-new` in the app
