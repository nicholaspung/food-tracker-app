#!/bin/bash

# Setup script to install git hooks
# Run this script after cloning the repository

echo "🔧 Setting up git hooks..."

# Copy pre-push hook
cp .git/hooks/pre-push.sample .git/hooks/pre-push 2>/dev/null || true

# Create pre-push hook content
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash

# Pre-push hook to run Cypress e2e tests
# This hook runs before git push and prevents the push if tests fail

echo "🧪 Running E2E tests before push..."
echo ""

# Navigate to frontend directory
cd frontend

# Check if PocketBase backend is running
if ! curl -s http://127.0.0.1:8090/_/ > /dev/null 2>&1; then
    echo "❌ Error: PocketBase backend is not running!"
    echo "Please start the backend with: cd ../backend && go run main.go serve"
    exit 1
fi

# Run Cypress tests
npm run test:e2e

# Check if tests passed
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All E2E tests passed! Proceeding with push..."
    exit 0
else
    echo ""
    echo "❌ E2E tests failed! Push aborted."
    echo "Please fix the failing tests before pushing."
    exit 1
fi
EOF

# Make hook executable
chmod +x .git/hooks/pre-push

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now run E2E tests before every git push."
echo "To skip the hook temporarily, use: git push --no-verify"
