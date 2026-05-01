#!/usr/bin/env python3
"""Render a cut video with animated tap annotations from exported JSON."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


MIN_KEEP_DURATION = 0.01
MERGE_EPSILON = 1e-6


@dataclass(frozen=True)
class Cut:
    id: str
    start: float
    end: float


@dataclass(frozen=True)
class Tap:
    id: str
    timestamp: float
    x: float
    y: float


@dataclass(frozen=True)
class Segment:
    start: float
    end: float


@dataclass(frozen=True)
class VideoInfo:
    duration: float
    width: int
    height: int
    has_audio: bool


class AnnotationError(Exception):
    """Raised for user-correctable annotation or input errors."""


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        fail(f"{name} is required and must be on PATH.")
    return path


def run_json_command(args: list[str]) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            args,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() or exc.stdout.strip()
        if details:
            fail(f"command failed: {' '.join(args)}\n{details}")
        fail(f"command failed: {' '.join(args)}")

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        fail(f"could not parse ffprobe output: {exc}")


def probe_video(video_path: Path) -> VideoInfo:
    data = run_json_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,width,height",
            "-of",
            "json",
            str(video_path),
        ]
    )

    streams = data.get("streams")
    if not isinstance(streams, list):
        fail("ffprobe did not return stream data.")

    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video_stream:
        fail("input file does not contain a video stream.")

    try:
        width = int(video_stream["width"])
        height = int(video_stream["height"])
        duration = float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError) as exc:
        fail(f"could not read video width, height, or duration: {exc}")

    if width <= 0 or height <= 0:
        fail("input video has invalid dimensions.")
    if not math.isfinite(duration) or duration <= 0:
        fail("input video has invalid or missing duration.")

    has_audio = any(stream.get("codec_type") == "audio" for stream in streams)
    return VideoInfo(duration=duration, width=width, height=height, has_audio=has_audio)


def read_annotations(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        fail(f"annotation JSON does not exist: {path}")
    except json.JSONDecodeError as exc:
        fail(f"annotation JSON is malformed: {exc}")
    except OSError as exc:
        fail(f"could not read annotation JSON: {exc}")

    if not isinstance(data, dict):
        fail("annotation JSON must be an object.")
    return data


def as_float(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise AnnotationError(f"{label} must be a number.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise AnnotationError(f"{label} must be a number.")
    if not math.isfinite(number):
        raise AnnotationError(f"{label} must be finite.")
    return number


def validate_annotations(data: dict[str, Any], video_path: Path, duration: float) -> tuple[list[Cut], list[Tap]]:
    if data.get("version") != 1:
        fail("annotation JSON must have version 1.")

    cuts_data = data.get("cuts")
    taps_data = data.get("taps")
    if not isinstance(cuts_data, list):
        fail("annotation JSON must contain a cuts array.")
    if not isinstance(taps_data, list):
        fail("annotation JSON must contain a taps array.")

    json_filename = data.get("videoFilename")
    if isinstance(json_filename, str) and json_filename and json_filename != video_path.name:
        warn(f"JSON was exported for {json_filename}, but input video is {video_path.name}.")

    cuts: list[Cut] = []
    for index, item in enumerate(cuts_data, start=1):
        if not isinstance(item, dict):
            fail(f"cut {index} must be an object.")
        try:
            start = as_float(item.get("start"), f"cut {index} start")
            end = as_float(item.get("end"), f"cut {index} end")
        except AnnotationError as exc:
            fail(str(exc))

        if start < 0 or end < 0:
            fail(f"cut {index} cannot use negative times.")
        if start >= end:
            fail(f"cut {index} must have start < end.")
        if end > duration:
            fail(f"cut {index} ends after the input duration ({end:.3f}s > {duration:.3f}s).")

        cuts.append(Cut(id=str(item.get("id") or f"cut-{index}"), start=start, end=end))

    merged_cuts = merge_cuts(cuts)

    taps: list[Tap] = []
    for index, item in enumerate(taps_data, start=1):
        if not isinstance(item, dict):
            fail(f"tap {index} must be an object.")
        try:
            timestamp = as_float(item.get("timestamp"), f"tap {index} timestamp")
            x = as_float(item.get("x"), f"tap {index} x")
            y = as_float(item.get("y"), f"tap {index} y")
        except AnnotationError as exc:
            fail(str(exc))

        if timestamp < 0 or timestamp > duration:
            fail(f"tap {index} timestamp is outside the input duration.")
        if not 0 <= x <= 1:
            fail(f"tap {index} x must be between 0 and 1.")
        if not 0 <= y <= 1:
            fail(f"tap {index} y must be between 0 and 1.")

        for cut in merged_cuts:
            if cut.start <= timestamp < cut.end:
                fail(
                    f"tap {index} at {timestamp:.3f}s falls inside cut "
                    f"{cut.start:.3f}s-{cut.end:.3f}s."
                )

        taps.append(Tap(id=str(item.get("id") or f"tap-{index}"), timestamp=timestamp, x=x, y=y))

    return merged_cuts, sorted(taps, key=lambda tap: tap.timestamp)


def merge_cuts(cuts: Iterable[Cut]) -> list[Cut]:
    ordered = sorted(cuts, key=lambda cut: (cut.start, cut.end))
    if not ordered:
        return []

    merged: list[Cut] = [ordered[0]]
    for cut in ordered[1:]:
        previous = merged[-1]
        if cut.start <= previous.end + MERGE_EPSILON:
            merged[-1] = Cut(
                id=f"{previous.id}+{cut.id}",
                start=previous.start,
                end=max(previous.end, cut.end),
            )
        else:
            merged.append(cut)
    return merged


def compute_keep_segments(cuts: list[Cut], duration: float) -> list[Segment]:
    segments: list[Segment] = []
    cursor = 0.0

    for cut in cuts:
        if cut.start - cursor >= MIN_KEEP_DURATION:
            segments.append(Segment(start=cursor, end=cut.start))
        cursor = max(cursor, cut.end)

    if duration - cursor >= MIN_KEEP_DURATION:
        segments.append(Segment(start=cursor, end=duration))

    return segments


def adjusted_timestamp(tap: Tap, cuts: list[Cut]) -> float:
    removed = 0.0
    for cut in cuts:
        if cut.end <= tap.timestamp:
            removed += cut.end - cut.start
        elif cut.start < tap.timestamp:
            removed += tap.timestamp - cut.start
    return tap.timestamp - removed


def taps_for_segment(taps: list[Tap], segment: Segment) -> list[Tap]:
    return [tap for tap in taps if segment.start <= tap.timestamp < segment.end]


def parse_hex_color(value: str) -> tuple[int, int, int]:
    color = value.strip()
    named = {
        "white": "ffffff",
        "black": "000000",
        "red": "ff0000",
        "blue": "1667d9",
        "yellow": "f5b400",
    }
    color = named.get(color.lower(), color)
    if color.startswith("#"):
        color = color[1:]
    if len(color) != 6:
        fail("--ripple-color must be a 6-digit hex color or one of: white, black, red, blue, yellow.")
    try:
        return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)
    except ValueError:
        fail("--ripple-color must be a valid 6-digit hex color.")


def ffexpr(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def escape_expr(expr: str) -> str:
    return expr.replace(",", r"\,")


def geq_component_expr(
    source: str,
    color_value: int,
    tap: Tap,
    local_time: float,
    video_info: VideoInfo,
    ripple_duration: float,
    ripple_radius: float,
    ripple_opacity: float,
) -> str:
    cx = tap.x * video_info.width
    cy = tap.y * video_info.height
    start = ffexpr(local_time)
    duration = ffexpr(ripple_duration)
    max_radius = ffexpr(ripple_radius)
    opacity = ffexpr(ripple_opacity)
    center_x = ffexpr(cx)
    center_y = ffexpr(cy)
    color = ffexpr(float(color_value))

    progress = f"((T-{start})/{duration})"
    radius = f"(6+({max_radius}-6)*{progress})"
    alpha = f"({opacity}*(1-{progress}))"
    distance = f"hypot(X-{center_x},Y-{center_y})"
    ring = f"(between(T,{start},{start}+{duration})*lte(abs({distance}-{radius}),4))"
    blended = f"({source}(X,Y)*(1-{alpha})+{color}*{alpha})"
    return escape_expr(f"if({ring},{blended},{source}(X,Y))")


def apply_tap_filters(
    input_label: str,
    output_label: str,
    taps: list[Tap],
    segment: Segment,
    video_info: VideoInfo,
    ripple_duration: float,
    ripple_radius: float,
    ripple_opacity: float,
    ripple_color: tuple[int, int, int],
) -> str:
    if not taps:
        return f"{input_label}format=yuv420p{output_label}"

    chain_label = input_label
    filters: list[str] = []

    for index, tap in enumerate(taps):
        next_label = output_label if index == len(taps) - 1 else f"[tap{segment.start:.6f}_{index}]".replace(".", "_")
        local_time = tap.timestamp - segment.start
        red = geq_component_expr(
            "r",
            ripple_color[0],
            tap,
            local_time,
            video_info,
            ripple_duration,
            ripple_radius,
            ripple_opacity,
        )
        green = geq_component_expr(
            "g",
            ripple_color[1],
            tap,
            local_time,
            video_info,
            ripple_duration,
            ripple_radius,
            ripple_opacity,
        )
        blue = geq_component_expr(
            "b",
            ripple_color[2],
            tap,
            local_time,
            video_info,
            ripple_duration,
            ripple_radius,
            ripple_opacity,
        )
        prefix = "format=rgb24," if index == 0 else ""
        suffix = ",format=yuv420p" if index == len(taps) - 1 else ""
        filters.append(f"{chain_label}{prefix}geq=r='{red}':g='{green}':b='{blue}'{suffix}{next_label}")
        chain_label = next_label

    return ";".join(filters)


def build_filter_complex(
    segments: list[Segment],
    taps: list[Tap],
    cuts: list[Cut],
    video_info: VideoInfo,
    ripple_duration: float,
    ripple_radius: float,
    ripple_opacity: float,
    ripple_color: tuple[int, int, int],
) -> tuple[str, list[str]]:
    filters: list[str] = []
    concat_inputs: list[str] = []

    for index, segment in enumerate(segments):
        base_video = f"[basev{index}]"
        output_video = f"[v{index}]"
        filters.append(
            f"[0:v]trim=start={ffexpr(segment.start)}:end={ffexpr(segment.end)},"
            f"setpts=PTS-STARTPTS{base_video}"
        )
        segment_taps = taps_for_segment(taps, segment)
        filters.append(
            apply_tap_filters(
                base_video,
                output_video,
                segment_taps,
                segment,
                video_info,
                ripple_duration,
                ripple_radius,
                ripple_opacity,
                ripple_color,
            )
        )
        concat_inputs.append(output_video)

        if video_info.has_audio:
            audio_label = f"[a{index}]"
            filters.append(
                f"[0:a]atrim=start={ffexpr(segment.start)}:end={ffexpr(segment.end)},"
                f"asetpts=PTS-STARTPTS{audio_label}"
            )
            concat_inputs.append(audio_label)

    concat_filter = "".join(concat_inputs)
    if video_info.has_audio:
        concat_filter += f"concat=n={len(segments)}:v=1:a=1[outv][outa]"
        maps = ["-map", "[outv]", "-map", "[outa]"]
    else:
        concat_filter += f"concat=n={len(segments)}:v=1:a=0[outv]"
        maps = ["-map", "[outv]"]

    filters.append(concat_filter)

    for tap in taps:
        print(
            f"tap {tap.id}: {tap.timestamp:.3f}s -> {adjusted_timestamp(tap, cuts):.3f}s",
            file=sys.stderr,
        )

    return ";".join(filters), maps


def render(
    video_path: Path,
    output_path: Path,
    filter_complex: str,
    maps: list[str],
    has_audio: bool,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-filter_complex",
        filter_complex,
        *maps,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
    ]
    if has_audio:
        command += ["-c:a", "aac"]
    command += ["-movflags", "+faststart", str(output_path)]

    print("running ffmpeg...", file=sys.stderr)
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as exc:
        fail(f"ffmpeg failed with exit code {exc.returncode}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a .mov with cuts and tap ripple annotations from exported JSON."
    )
    parser.add_argument("video", type=Path, help="Source .mov file.")
    parser.add_argument("annotations", type=Path, help="Annotation JSON exported from index.html.")
    parser.add_argument("--output", type=Path, help="Output .mov path. Defaults to output.mov beside the video.")
    parser.add_argument("--ripple-duration", type=float, default=0.6, help="Tap ripple duration in seconds.")
    parser.add_argument("--ripple-radius", type=float, default=44.0, help="Final tap ripple radius in pixels.")
    parser.add_argument("--ripple-color", default="white", help="Ripple color as white, black, red, blue, yellow, or RRGGBB.")
    parser.add_argument("--ripple-opacity", type=float, default=0.85, help="Starting ripple opacity from 0 to 1.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    require_tool("ffmpeg")
    require_tool("ffprobe")

    video_path = args.video.expanduser().resolve()
    annotation_path = args.annotations.expanduser().resolve()
    output_path = (
        args.output.expanduser().resolve()
        if args.output
        else video_path.with_name("output.mov")
    )

    if not video_path.exists():
        fail(f"input video does not exist: {video_path}")
    if not video_path.is_file():
        fail(f"input video is not a file: {video_path}")

    if args.ripple_duration <= 0:
        fail("--ripple-duration must be greater than 0.")
    if args.ripple_radius <= 0:
        fail("--ripple-radius must be greater than 0.")
    if not 0 <= args.ripple_opacity <= 1:
        fail("--ripple-opacity must be between 0 and 1.")

    annotations = read_annotations(annotation_path)
    video_info = probe_video(video_path)
    cuts, taps = validate_annotations(annotations, video_path, video_info.duration)
    segments = compute_keep_segments(cuts, video_info.duration)
    if not segments:
        fail("cuts remove the entire video; nothing remains to render.")

    ripple_color = parse_hex_color(args.ripple_color)
    filter_complex, maps = build_filter_complex(
        segments=segments,
        taps=taps,
        cuts=cuts,
        video_info=video_info,
        ripple_duration=args.ripple_duration,
        ripple_radius=args.ripple_radius,
        ripple_opacity=args.ripple_opacity,
        ripple_color=ripple_color,
    )
    render(video_path, output_path, filter_complex, maps, video_info.has_audio)
    print(f"output: {output_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)
