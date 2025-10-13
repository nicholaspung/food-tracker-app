Use the pre-push-documentation subagent to analyze recent changes and update all documentation before pushing to main branch.

The subagent will:
1. Analyze git changes (uncommitted or last commit)
2. Update E2E test documentation if tests changed
3. Update API access documentation if collections changed
4. Update README if significant features were added
5. Generate a user-friendly "What's New" changelog entry

After the subagent completes, review the changes and commit them before pushing to main.
