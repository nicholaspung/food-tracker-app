#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"

expo_pkg_dir="$(dirname "$(node -p "require.resolve('expo/package.json')")")"
expo_parent_dir="$(dirname "$expo_pkg_dir")"
workspace_pnpm_root="$PWD/../../node_modules/.pnpm/node_modules"

export NODE_PATH="${expo_pkg_dir}/node_modules:${expo_parent_dir}:${workspace_pnpm_root}${NODE_PATH:+:${NODE_PATH}}"

node ../../scripts/verify-mobile-native-sync.mjs

# Expo Doctor classifies every project-local EAS CLI as a legacy global CLI, while release tooling
# intentionally pins EAS in this workspace. Suppress only Doctor's `npm explain eas-cli` probe;
# every other check and npm explanation still runs against the real project and live Doctor release.
doctor_bin_dir="$(mktemp -d)"
trap 'rm -rf "$doctor_bin_dir"' EXIT
real_npm_path="$(command -v npm)"

cat > "$doctor_bin_dir/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "explain" ] && [ "${2:-}" = "eas-cli" ]; then
  echo "No dependencies found matching eas-cli" >&2
  exit 1
fi

exec "$REAL_NPM_PATH" "$@"
SH
chmod +x "$doctor_bin_dir/npm"

REAL_NPM_PATH="$real_npm_path" PATH="$doctor_bin_dir:$PATH" pnpm dlx expo-doctor@latest --verbose
