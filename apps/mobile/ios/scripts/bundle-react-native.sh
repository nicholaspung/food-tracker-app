#!/bin/bash

set -eo pipefail

if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

# The project root is one level up from the ios directory.
export PROJECT_ROOT="$PROJECT_DIR"/..

if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi

if [[ -z "$ENTRY_FILE" ]]; then
  export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi

if [[ -z "$CLI_PATH" ]]; then
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")"
fi

if [[ -z "$BUNDLE_COMMAND" ]]; then
  export BUNDLE_COMMAND="export:embed"
fi

if [[ -f "$PODS_ROOT/../.xcode.env.updates" ]]; then
  source "$PODS_ROOT/../.xcode.env.updates"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  source "$PODS_ROOT/../.xcode.env.local"
fi

REACT_NATIVE_XCODE_SCRIPT="$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"
POSTHOG_XCODE_SCRIPT="$("$NODE_BINARY" --print "require('path').join(require('path').dirname(require.resolve('posthog-react-native')), '..', 'tooling', 'posthog-xcode.sh')")"

resolve_posthog_cli() {
  local project_cli="$PROJECT_ROOT/node_modules/.bin/posthog-cli"

  if [[ -x "$project_cli" ]]; then
    printf '%s\n' "$project_cli"
    return 0
  fi

  if command -v posthog-cli >/dev/null 2>&1; then
    command -v posthog-cli
    return 0
  fi

  return 1
}

POSTHOG_CLI_BIN="$(resolve_posthog_cli || true)"
HAS_POSTHOG_CONFIG="false"

if [[ -n "${POSTHOG_CLI_API_KEY:-}" && -n "${POSTHOG_CLI_HOST:-}" && -n "${POSTHOG_CLI_PROJECT_ID:-}" ]]; then
  HAS_POSTHOG_CONFIG="true"
fi

# PostHog sourcemap upload is optional. Fall back to the standard React Native
# bundling script when the CLI or its required credentials are unavailable.
if [[ -n "$POSTHOG_CLI_BIN" && "$HAS_POSTHOG_CONFIG" = "true" ]]; then
  /bin/sh "$POSTHOG_XCODE_SCRIPT" "$REACT_NATIVE_XCODE_SCRIPT"
else
  if [[ -z "$POSTHOG_CLI_BIN" ]]; then
    echo "warning: posthog-cli unavailable in this build environment; skipping sourcemap upload."
  else
    echo "warning: POSTHOG_CLI_* values are incomplete; skipping sourcemap upload."
  fi

  /bin/sh "$REACT_NATIVE_XCODE_SCRIPT"
fi
