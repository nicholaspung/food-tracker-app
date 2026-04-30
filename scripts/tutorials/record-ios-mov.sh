#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_DEVICE_NAME="iPhone 16"
DEVICE_NAME=""
FLOW_ID="manual"
OPEN_OUTPUT=0

usage() {
  cat <<'USAGE'
Usage:
  pnpm mobile:tutorial:ios:record [flow-id] [--device "iPhone 16"] [--open]

Records the booted iOS Simulator to a .mov without building or running XCUITest.
Press Enter to stop recording.

Examples:
  pnpm mobile:tutorial:ios:record tip-calculator
  pnpm mobile:tutorial:ios:record tip-calculator --device "iPhone 17" --open
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 0 && "${1:-}" != --* ]]; then
  FLOW_ID="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE_NAME="${2:-}"
      shift 2
      ;;
    --open)
      OPEN_OUTPUT=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

command -v xcrun >/dev/null || { echo "xcrun is required." >&2; exit 1; }

booted_devices() {
  xcrun simctl list devices booted | awk -F '[()]' '/Booted/ { print $2 "|" $1 }'
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

timestamp="$(date -u +%Y-%m-%dT%H%M%S)"
OUTPUT_DIR="$ROOT_DIR/tutorial-artifacts/ios/$FLOW_ID/$timestamp"
mkdir -p "$OUTPUT_DIR"

DEVICE_UDID="$(select_device)"
RAW_VIDEO="$OUTPUT_DIR/raw.mov"
RECORDER_LOG="$OUTPUT_DIR/recordVideo.log"

recording_pid=""
cleanup() {
  if [[ -n "$recording_pid" ]] && kill -0 "$recording_pid" >/dev/null 2>&1; then
    kill -INT "$recording_pid" >/dev/null 2>&1 || true
    wait "$recording_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Recording simulator to $RAW_VIDEO"
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

echo "Recording started. Interact with the Simulator now."
read -r -p "Press Enter to stop recording..."

cleanup
trap - EXIT

if [[ "$OPEN_OUTPUT" -eq 1 ]]; then
  open "$OUTPUT_DIR"
fi

echo "MOV: $RAW_VIDEO"
