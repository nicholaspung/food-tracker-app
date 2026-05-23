#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"

expo_pkg_dir="$(dirname "$(pnpm exec node -p "require.resolve('expo/package.json')")")"
expo_parent_dir="$(dirname "$expo_pkg_dir")"
workspace_pnpm_root="$(pnpm root -w)/.pnpm/node_modules"

export NODE_PATH="${expo_pkg_dir}/node_modules:${expo_parent_dir}:${workspace_pnpm_root}${NODE_PATH:+:${NODE_PATH}}"

npx expo-doctor --verbose
