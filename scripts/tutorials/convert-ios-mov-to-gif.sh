#!/usr/bin/env bash

set -euo pipefail

FPS=12
WIDTH=480
OUTPUT_PATH=""
START_TIME=""
DURATION=""
OPEN_OUTPUT=0

usage() {
  cat <<'USAGE'
Usage:
  pnpm mobile:tutorial:ios:gif <input.mov> [--output output.gif] [--fps 12] [--width 480] [--start 1.2] [--duration 6] [--open]

Converts a simulator .mov into an optimized GIF with ffmpeg.

Examples:
  pnpm mobile:tutorial:ios:gif tutorial-artifacts/ios/tip-calculator/2026-04-30T120000/raw.mov
  pnpm mobile:tutorial:ios:gif raw.mov --output tip-calculator.gif --start 0.8 --duration 5.5
USAGE
}

if [[ $# -eq 0 || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit $([[ $# -eq 0 ]] && echo 1 || echo 0)
fi

INPUT_PATH="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT_PATH="${2:-}"
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
    --start)
      START_TIME="${2:-}"
      shift 2
      ;;
    --duration)
      DURATION="${2:-}"
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

command -v ffmpeg >/dev/null || { echo "ffmpeg is required." >&2; exit 1; }

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "Missing input movie: $INPUT_PATH" >&2
  exit 1
fi

if [[ -z "$OUTPUT_PATH" ]]; then
  input_dir="$(cd "$(dirname "$INPUT_PATH")" && pwd)"
  input_name="$(basename "$INPUT_PATH")"
  OUTPUT_PATH="$input_dir/${input_name%.*}.gif"
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

ffmpeg_args=(-y)
if [[ -n "$START_TIME" ]]; then
  ffmpeg_args+=(-ss "$START_TIME")
fi
ffmpeg_args+=(-i "$INPUT_PATH")
if [[ -n "$DURATION" ]]; then
  ffmpeg_args+=(-t "$DURATION")
fi
ffmpeg_args+=(
  -filter_complex "fps=$FPS,scale=$WIDTH:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
  "$OUTPUT_PATH"
)

ffmpeg "${ffmpeg_args[@]}"

if [[ "$OPEN_OUTPUT" -eq 1 ]]; then
  open "$(dirname "$OUTPUT_PATH")"
fi

echo "GIF: $OUTPUT_PATH"
