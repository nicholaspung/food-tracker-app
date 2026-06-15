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
HAS_POSTHOG_GIT_CONTEXT="false"

sanitize_optional_tool_output() {
  sed \
    -e 's/^error:/warning:/' \
    -e 's/^fatal error:/warning:/'
}

if [[ -n "${POSTHOG_CLI_API_KEY:-}" && -n "${POSTHOG_CLI_HOST:-}" && -n "${POSTHOG_CLI_PROJECT_ID:-}" ]]; then
  HAS_POSTHOG_CONFIG="true"
fi

if [[ -z "${GITHUB_SHA:-}" && -n "${EAS_BUILD_GIT_COMMIT_HASH:-}" && -n "${POSTHOG_CLI_GITHUB_REPOSITORY:-}" ]]; then
  export GITHUB_ACTIONS="true"
  export GITHUB_SHA="$EAS_BUILD_GIT_COMMIT_HASH"
  export GITHUB_REPOSITORY="$POSTHOG_CLI_GITHUB_REPOSITORY"
  export GITHUB_SERVER_URL="${POSTHOG_CLI_GITHUB_SERVER_URL:-https://github.com}"
  export GITHUB_REF_NAME="${POSTHOG_CLI_GITHUB_REF_NAME:-${EAS_BUILD_PROFILE:-eas-build}}"
fi

if [[ -n "${GITHUB_SHA:-}" || -n "${VERCEL:-}" ]]; then
  HAS_POSTHOG_GIT_CONTEXT="true"
elif git -C "${SRCROOT:-$PROJECT_ROOT}" rev-parse --show-toplevel >/dev/null 2>&1; then
  HAS_POSTHOG_GIT_CONTEXT="true"
fi

# PostHog sourcemap upload is optional. Fall back to the standard React Native
# bundling script when the CLI, its credentials, or Git/CI metadata are unavailable.
if [[ -n "$POSTHOG_CLI_BIN" && "$HAS_POSTHOG_CONFIG" = "true" && "$HAS_POSTHOG_GIT_CONTEXT" = "true" ]]; then
  POSTHOG_OUTPUT_FILE="$(mktemp "${TMPDIR:-/tmp}/posthog-xcode-output.XXXXXX")"
  trap 'rm -f "$POSTHOG_OUTPUT_FILE"' EXIT

  set +e
  /bin/sh "$POSTHOG_XCODE_SCRIPT" "$REACT_NATIVE_XCODE_SCRIPT" >"$POSTHOG_OUTPUT_FILE" 2>&1
  POSTHOG_XCODE_EXIT_CODE=$?
  set -e

  if [[ "$POSTHOG_XCODE_EXIT_CODE" -ne 0 ]]; then
    sanitize_optional_tool_output <"$POSTHOG_OUTPUT_FILE"
    echo "warning: PostHog sourcemap upload failed; retrying standard React Native bundling without sourcemap upload."
    /bin/sh "$REACT_NATIVE_XCODE_SCRIPT"
  else
    cat "$POSTHOG_OUTPUT_FILE"
  fi
else
  if [[ -z "$POSTHOG_CLI_BIN" ]]; then
    echo "warning: posthog-cli unavailable in this build environment; skipping sourcemap upload."
  elif [[ "$HAS_POSTHOG_CONFIG" != "true" ]]; then
    echo "warning: POSTHOG_CLI_* values are incomplete; skipping sourcemap upload."
  else
    echo "warning: Git/CI metadata unavailable; skipping PostHog sourcemap upload."
  fi

  /bin/sh "$REACT_NATIVE_XCODE_SCRIPT"
fi
