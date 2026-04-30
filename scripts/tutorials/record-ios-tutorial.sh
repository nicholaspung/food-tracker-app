#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOWS_DIR="$ROOT_DIR/scripts/tutorials/flows"
WORKSPACE="$ROOT_DIR/apps/mobile/ios/YummyRecs.xcworkspace"
SCHEME="YummyRecs"
DEFAULT_DEVICE_NAME="iPhone 16"
APP_BUNDLE_ID="com.yummyrecs.mobile"
FPS=12
WIDTH=480
DEVICE_NAME=""
OPEN_OUTPUT=0
PROMOTE=0

usage() {
  cat <<'USAGE'
Usage:
  pnpm mobile:tutorial:ios <flow-id> [--device "iPhone 16"] [--fps 12] [--width 480] [--open] [--promote]

Examples:
  pnpm mobile:tutorial:ios tip-calculator
  pnpm mobile:tutorial:ios tip-calculator --device "iPhone 16" --open
USAGE
}

if [[ $# -eq 0 ]]; then
  usage
  echo
  echo "Available flows:"
  find "$FLOWS_DIR" -maxdepth 1 -name '*.json' -exec basename {} .json \; | sort | sed 's/^/  - /'
  exit 1
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

FLOW_ID="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE_NAME="${2:-}"
      shift 2
      ;;
    --fps)
      FPS="${2:-}"
      shift 2
      ;;
    --width)
      WIDTH="${2:-}"
      shift 2
      ;;
    --open)
      OPEN_OUTPUT=1
      shift
      ;;
    --promote)
      PROMOTE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

FLOW_PATH="$FLOWS_DIR/$FLOW_ID.json"
if [[ ! -f "$FLOW_PATH" ]]; then
  echo "Missing flow: $FLOW_ID" >&2
  echo "Available flows:" >&2
  find "$FLOWS_DIR" -maxdepth 1 -name '*.json' -exec basename {} .json \; | sort | sed 's/^/  - /' >&2
  exit 1
fi

command -v xcrun >/dev/null || { echo "xcrun is required." >&2; exit 1; }
command -v xcodebuild >/dev/null || { echo "xcodebuild is required." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is required." >&2; exit 1; }
command -v node >/dev/null || { echo "node is required." >&2; exit 1; }

if [[ ! -d "$WORKSPACE" ]]; then
  echo "Missing iOS workspace: $WORKSPACE" >&2
  exit 1
fi

timestamp="$(date -u +%Y-%m-%dT%H%M%S)"
OUTPUT_DIR="$ROOT_DIR/tutorial-artifacts/ios/$FLOW_ID/$timestamp"
mkdir -p "$OUTPUT_DIR"

RAW_VIDEO="$OUTPUT_DIR/raw.mov"
OVERLAY_VIDEO="$OUTPUT_DIR/overlay.mp4"
GIF_OUTPUT="$OUTPUT_DIR/$FLOW_ID.gif"
EVENTS_PATH="$OUTPUT_DIR/events.json"
XCODE_LOG="$OUTPUT_DIR/xcodebuild.log"
RECORDER_LOG="$OUTPUT_DIR/recordVideo.log"

booted_devices() {
  xcrun simctl list devices booted | awk -F '[()]' '/Booted/ { print $2 "|" $1 }'
}

epoch_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

select_device() {
  local selected_udid=""
  local selected_name=""

  if [[ -n "$DEVICE_NAME" ]]; then
    selected_udid="$(xcrun simctl list devices available | awk -v name="$DEVICE_NAME" -F '[()]' '$0 ~ name && $0 !~ /unavailable/ { print $2; exit }')"
    if [[ -z "$selected_udid" ]]; then
      echo "Could not find available simulator named \"$DEVICE_NAME\"." >&2
      exit 1
    fi
    xcrun simctl boot "$selected_udid" >/dev/null 2>&1 || true
    xcrun simctl bootstatus "$selected_udid" -b >/dev/null
    echo "$selected_udid"
    return
  fi

  local booted_count
  booted_count="$(booted_devices | wc -l | tr -d ' ')"
  if [[ "$booted_count" -gt 0 ]]; then
    selected_udid="$(booted_devices | head -n 1 | cut -d '|' -f 1)"
    selected_name="$(booted_devices | head -n 1 | cut -d '|' -f 2 | sed 's/[[:space:]]*$//')"
    if [[ "$booted_count" -gt 1 ]]; then
      echo "Multiple booted simulators found; using $selected_name ($selected_udid). Pass --device to choose explicitly." >&2
    else
      echo "Using booted simulator $selected_name ($selected_udid)." >&2
    fi
    echo "$selected_udid"
    return
  fi

  DEVICE_NAME="$DEFAULT_DEVICE_NAME"
  selected_udid="$(xcrun simctl list devices available | awk -v name="$DEVICE_NAME" -F '[()]' '$0 ~ name && $0 !~ /unavailable/ { print $2; exit }')"
  if [[ -z "$selected_udid" ]]; then
    echo "No booted simulator and could not find default simulator \"$DEFAULT_DEVICE_NAME\"." >&2
    exit 1
  fi
  echo "Booting $DEFAULT_DEVICE_NAME ($selected_udid)." >&2
  xcrun simctl boot "$selected_udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$selected_udid" -b >/dev/null
  echo "$selected_udid"
}

DEVICE_UDID="$(select_device)"
DESTINATION="platform=iOS Simulator,id=$DEVICE_UDID"

recording_pid=""
cleanup() {
  if [[ -n "$recording_pid" ]] && kill -0 "$recording_pid" >/dev/null 2>&1; then
    kill -INT "$recording_pid" >/dev/null 2>&1 || true
    wait "$recording_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Recording $FLOW_ID to $OUTPUT_DIR"
xcrun simctl io "$DEVICE_UDID" recordVideo --codec=h264 --force "$RAW_VIDEO" >"$RECORDER_LOG" 2>&1 &
recording_pid="$!"

recording_started=0
for _ in $(seq 1 80); do
  if grep -q "Recording started" "$RECORDER_LOG" 2>/dev/null; then
    recording_started=1
    break
  fi
  if ! kill -0 "$recording_pid" >/dev/null 2>&1; then
    echo "recordVideo exited before recording started. See $RECORDER_LOG" >&2
    exit 1
  fi
  sleep 0.25
done

if [[ "$recording_started" -ne 1 ]]; then
  echo "Timed out waiting for simulator recording to start. See $RECORDER_LOG" >&2
  exit 1
fi

recording_epoch_ms="$(epoch_ms)"
set +e
TUTORIAL_FLOW_PATH="$FLOW_PATH" \
TUTORIAL_EVENTS_PATH="$EVENTS_PATH" \
TUTORIAL_APP_BUNDLE_ID="$APP_BUNDLE_ID" \
TUTORIAL_RECORDING_STARTED_AT_MS="$recording_epoch_ms" \
xcodebuild test \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  -only-testing:YummyRecsTutorialUITests \
  >"$XCODE_LOG" 2>&1
xcode_status=$?
set -e

cleanup
trap - EXIT

if [[ "$xcode_status" -ne 0 ]]; then
  echo "XCUITest failed. Raw artifacts were preserved in $OUTPUT_DIR" >&2
  echo "See $XCODE_LOG" >&2
  exit "$xcode_status"
fi

if [[ ! -f "$EVENTS_PATH" ]]; then
  echo "XCUITest completed but did not write events: $EVENTS_PATH" >&2
  exit 1
fi

node "$ROOT_DIR/scripts/tutorials/render-ios-tutorial.mjs" \
  --input "$RAW_VIDEO" \
  --events "$EVENTS_PATH" \
  --overlay "$OVERLAY_VIDEO" \
  --gif "$GIF_OUTPUT" \
  --fps "$FPS" \
  --width "$WIDTH"

if [[ "$PROMOTE" -eq 1 ]]; then
  output_name="$(node -e "const flow=require(process.argv[1]); process.stdout.write(flow.outputName || flow.id)" "$FLOW_PATH")"
  promoted_path="$ROOT_DIR/apps/mobile/assets/onboarding/$output_name.gif"
  cp "$GIF_OUTPUT" "$promoted_path"
  echo "Promoted GIF to $promoted_path"
fi

if [[ "$OPEN_OUTPUT" -eq 1 ]]; then
  open "$OUTPUT_DIR"
fi

echo "Raw video: $RAW_VIDEO"
echo "Overlay video: $OVERLAY_VIDEO"
echo "GIF: $GIF_OUTPUT"
echo "Events: $EVENTS_PATH"
