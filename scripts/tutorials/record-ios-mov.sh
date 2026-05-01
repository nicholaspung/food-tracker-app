#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_DEVICE_NAME="iPhone 16"
DEVICE_NAME=""
FLOW_ID=""
OPEN_OUTPUT=0
LIST_FLOWS=0

FLOW_COUNT=0
FLOW_SLUGS=()
FLOW_TITLES=()
FLOW_SECTIONS=()
FLOW_HINTS=()

add_flow() {
  local section="$1"
  local slug="$2"
  local title="$3"
  local hint="$4"

  FLOW_SLUGS[$FLOW_COUNT]="$slug"
  FLOW_TITLES[$FLOW_COUNT]="$title"
  FLOW_SECTIONS[$FLOW_COUNT]="$section"
  FLOW_HINTS[$FLOW_COUNT]="$hint"
  FLOW_COUNT=$((FLOW_COUNT + 1))
}

add_flow "Getting Started" "welcome" "Welcome to Yummy Recs" "Profile -> Tutorials -> Welcome to Yummy Recs"
add_flow "Getting Started" "month-privacy" "Shared with Breathing Room" "Profile -> Tutorials -> Shared with Breathing Room"
add_flow "Getting Started" "tutorials" "Watch Feature Tutorials" "Profile -> Tutorials -> Watch Feature Tutorials"
add_flow "Getting Started" "friends" "Add Friends Intentionally" "Profile -> Tutorials -> Add Friends Intentionally"
add_flow "Getting Started" "more-tools" "More Than Tracking" "Profile -> Tutorials -> More Than Tracking"
add_flow "Getting Started" "lists-intro" "Use Lists for Ideas" "Profile -> Tutorials -> Use Lists for Ideas"
add_flow "Getting Started" "bills-tips" "Split Bills and Calculate Tips" "Profile -> Tutorials -> Split Bills and Calculate Tips"
add_flow "Getting Started" "settings" "Personalize Your Experience" "Profile -> Tutorials -> Personalize Your Experience"
add_flow "Getting Started" "support-invites" "Invite Friends and Get Help" "Profile -> Tutorials -> Invite Friends and Get Help"
add_flow "Add Tutorials" "track-restaurant-visit" "Track Restaurant Visit" "Profile -> Tutorials -> Track Restaurant Visit"
add_flow "Add Tutorials" "track-food-product" "Track Food Product" "Profile -> Tutorials -> Track Food Product"
add_flow "Add Tutorials" "log-note" "Log a Note" "Profile -> Tutorials -> Log a Note"
add_flow "Add Tutorials" "process-saved-photos" "Process Saved Photos" "Profile -> Tutorials -> Process Saved Photos"
add_flow "Add Tutorials" "manage-notes" "Manage Notes" "Profile -> Tutorials -> Manage Notes"
add_flow "More Tutorials" "lists" "Restaurant Lists" "Profile -> Tutorials -> Restaurant Lists"
add_flow "More Tutorials" "split-bill" "Split a Bill" "Profile -> Tutorials -> Split a Bill"
add_flow "More Tutorials" "tip-calculator" "Tip Calculator" "Profile -> Tutorials -> Tip Calculator"

SELECTED_TITLE=""
SELECTED_SECTION=""
SELECTED_HINT=""

usage() {
  cat <<'USAGE'
Usage:
  pnpm mobile:tutorial:ios:record [flow-slug] [--device "iPhone 16"] [--open]
  pnpm mobile:tutorial:ios:record --list

Records the booted iOS Simulator to a .mov without building or running XCUITest.
When no flow slug is provided, choose a tutorial from an interactive menu.
Press Enter to stop recording.

Examples:
  pnpm mobile:tutorial:ios:record tip-calculator
  pnpm mobile:tutorial:ios:record tip-calculator --device "iPhone 17" --open
USAGE
}

print_flows() {
  local current_section=""

  for ((i = 0; i < FLOW_COUNT; i++)); do
    if [[ "${FLOW_SECTIONS[$i]}" != "$current_section" ]]; then
      current_section="${FLOW_SECTIONS[$i]}"
      printf '\n%s\n' "$current_section"
    fi

    printf '  %-24s %s\n' "${FLOW_SLUGS[$i]}" "${FLOW_TITLES[$i]}"
  done
}

print_menu() {
  local current_section=""

  echo "Select a tutorial to record:"
  for ((i = 0; i < FLOW_COUNT; i++)); do
    if [[ "${FLOW_SECTIONS[$i]}" != "$current_section" ]]; then
      current_section="${FLOW_SECTIONS[$i]}"
      printf '\n%s\n' "$current_section"
    fi

    printf '  %2d. %s (%s)\n' "$((i + 1))" "${FLOW_TITLES[$i]}" "${FLOW_SLUGS[$i]}"
  done
  echo
}

resolve_flow() {
  local slug="$1"

  for ((i = 0; i < FLOW_COUNT; i++)); do
    if [[ "${FLOW_SLUGS[$i]}" == "$slug" ]]; then
      FLOW_ID="${FLOW_SLUGS[$i]}"
      SELECTED_TITLE="${FLOW_TITLES[$i]}"
      SELECTED_SECTION="${FLOW_SECTIONS[$i]}"
      SELECTED_HINT="${FLOW_HINTS[$i]}"
      return 0
    fi
  done

  return 1
}

select_flow_interactively() {
  local selection=""

  print_menu
  read -r -p "Enter tutorial number: " selection

  if ! [[ "$selection" =~ ^[0-9]+$ ]] || [[ "$selection" -lt 1 ]] || [[ "$selection" -gt "$FLOW_COUNT" ]]; then
    echo "Invalid selection: $selection" >&2
    exit 1
  fi

  local index=$((selection - 1))
  FLOW_ID="${FLOW_SLUGS[$index]}"
  SELECTED_TITLE="${FLOW_TITLES[$index]}"
  SELECTED_SECTION="${FLOW_SECTIONS[$index]}"
  SELECTED_HINT="${FLOW_HINTS[$index]}"
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
    --list)
      LIST_FLOWS=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$LIST_FLOWS" -eq 1 ]]; then
  print_flows
  exit 0
fi

if [[ -z "$FLOW_ID" ]]; then
  select_flow_interactively
elif ! resolve_flow "$FLOW_ID"; then
  echo "Unknown tutorial flow slug: $FLOW_ID" >&2
  echo "Valid tutorial flow slugs:" >&2
  print_flows >&2
  exit 1
fi

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

echo "Tutorial: $SELECTED_TITLE"
echo "Section: $SELECTED_SECTION"
echo "Manual navigation: $SELECTED_HINT"
echo "Output directory: $OUTPUT_DIR"
echo

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
echo "Recorder log: $RECORDER_LOG"
echo "Output directory: $OUTPUT_DIR"
