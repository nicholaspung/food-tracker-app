# Video Annotation & Export Tool

This folder contains a local browser annotation tool and a Python renderer for trimming `.mov` files, adding animated tap ripples, and building tutorial GIFs from screenshots, clips, or both.

All repo-owned files required to run this web app live in this folder:

- `index.html`
- `server.mjs`
- `render.py`
- `README.md`

The root `package.json` only provides convenience scripts for starting the local server. The iOS simulator recording script stays in `scripts/tutorials/record-ios-mov.sh` because it creates source footage rather than modifying or converting videos.

## Prerequisites

- Python 3
- FFmpeg and FFprobe installed and available on `PATH`

Check the FFmpeg tools:

```bash
ffmpeg -version
ffprobe -version
```

## Open the Tool

Run the local helper server:

```bash
pnpm video-annotation:dev
```

Then open the printed localhost URL. The helper server is required for button-based `.mov` rendering because the browser cannot run Python or FFmpeg by itself.

You can still open the static file directly if you only need JSON export:

```text
scripts/tutorials/video-annotation/index.html
```

No dev server is required for JSON-only annotation export. The helper server is required for MOV rendering and GIF export workflows.

## Video Annotation Tab

1. Load a `.mov` file with the file picker.
2. Play or seek through the video.
3. Click `Add Tap`, then click the video frame to add a tap at the current timestamp.
4. Click `Add Cut`, then drag the `Start` and `End` handles on the timeline. The video frame follows whichever handle you move.
5. Click `Confirm Cut` to save the pending cut, or `Cancel` to discard it.
6. Delete any mistaken cuts or taps from the annotation lists.
7. Click `Preview Without Cuts` to play the source video while skipping the red cut regions in the browser.
8. Click `Export JSON` to download the annotation file, or `Export MOV` to render the final video with the local helper server.
9. After `Export MOV` finishes, use `Export GIF` to convert the rendered `.mov` into a `.gif`.

Tap coordinates are normalized to the displayed video content:

- `x=0, y=0` is the top-left of the visible video.
- `x=1, y=1` is the bottom-right of the visible video.

## Screenshot GIF Tab

The `Screenshot GIF` tab builds an animated GIF from browser-captured still frames:

1. Upload a local video.
2. Seek to the frame you want with the browser video controls.
3. Click `Capture Current Frame`.
4. Reorder, duplicate, remove, and select screenshots in the gallery.
5. Click the selected screenshot preview to place a tap ripple, or use `Clear Tap` to remove it.
6. Configure GIF filename, frame duration, FPS, width, and ripple settings.
7. Click `Export to GIF`, then choose a save folder or use the browser download fallback.

Screenshot capture, gallery editing, duplication, removal, reordering, and tap placement happen in the browser. Final GIF rendering uses the local helper server and FFmpeg so the output can be saved with the same folder picker/download behavior as the existing exports.

## Mixed GIF Tab

The `Mixed GIF` tab builds one animated GIF from a manually ordered list of browser-captured screenshots and source-video clips:

1. Upload a local video.
2. Seek to tap moments and click `Capture Screenshot`.
3. Select screenshot items and click the preview to place tap ripples.
4. Click `Add Clip`, adjust the `Start` and `End` handles on the timeline, then click `Confirm Clip`.
5. Select a clip row, or click its select icon, then click `Preview` to play only that clip range in the source video.
6. In the `Selected Item` sub-tab, click inside the selected clip preview to add timed tap ripples. Clips can have multiple taps.
7. Adjust clip start/end with the selected clip slider or numeric fields, jump the preview to clip start/end, and adjust clip speed in the `Selected Item` sub-tab when a clip is selected.
8. Reorder, duplicate, remove, and select screenshots and clips in the scrollable timeline item list. Clicking a thumbnail opens a modal preview; screenshot previews show only the screenshot, while clip previews render and play the clipped segment.
9. In the `GIF Export` sub-tab, configure GIF filename, screenshot duration, FPS, width, and ripple settings.
10. Click `Generate Preview` to render the GIF preview, then click `Download GIF` when the preview looks right.

Screenshot items keep their configured still-frame duration. Screenshot taps can play at the beginning of the still frame or right before the next item. Clip items keep their selected source-video duration adjusted by their per-clip speed. Final GIF order matches the manual order in the timeline item list. Mixed GIF export intentionally drops audio because GIF output has no audio.
Manual timeline dragging remains available for seeking through the full source video; clip preview only constrains playback while that preview is active. The timeline item list scrolls independently for larger tutorials.

## Render

From the browser, click `Export MOV`. In supported browsers such as Chrome and Edge, the tool asks you to choose a folder and writes the rendered `.mov` there. If folder picking is unavailable, the rendered `.mov` downloads through the browser.

After the rendered `.mov` is created, the browser shows GIF export controls. GIF export converts the rendered video, so the GIF includes the confirmed cuts and tap ripples. Defaults match the CLI converter:

- FPS: `12`
- Width: `480`
- Start and duration: blank, which uses the full rendered `.mov`

In supported browsers, the generated `.gif` is written to the folder you choose. If folder picking is unavailable, the `.gif` downloads through the browser.

The screenshot GIF tab uses the same save behavior. Defaults are:

- Frame duration: `1.6` seconds
- FPS: `12`
- Width: `480`
- Ripple duration: `0.6`
- Ripple radius: `44`
- Ripple color: `white`

The mixed GIF tab uses the same save behavior and rendering defaults as the screenshot GIF tab. The default filename is `<video-base>-mixed.gif`.
- Ripple opacity: `0.85`

The Python renderer is used internally by the local helper server for `Export MOV`.

Internal renderer command shape:

```bash
python3 scripts/tutorials/video-annotation/render.py my_video.mov annotations.json
```

Render to an explicit output path:

```bash
python3 scripts/tutorials/video-annotation/render.py my_video.mov annotations.json --output final.mov
```

Optional ripple settings:

```bash
python3 scripts/tutorials/video-annotation/render.py my_video.mov annotations.json \
  --output final.mov \
  --ripple-duration 0.6 \
  --ripple-radius 44 \
  --ripple-color white \
  --ripple-opacity 0.85
```

`--ripple-color` accepts `white`, `black`, `red`, `blue`, `yellow`, or a 6-digit hex color such as `00ccff`.

## JSON Schema

The browser exports JSON in this shape:

```json
{
  "version": 1,
  "videoFilename": "raw.mov",
  "duration": 12.345,
  "cuts": [
    {
      "id": "cut-example",
      "start": 1.2,
      "end": 2.8
    }
  ],
  "taps": [
    {
      "id": "tap-example",
      "timestamp": 4.25,
      "x": 0.5,
      "y": 0.42
    }
  ]
}
```

## Validation Notes

- Tap timestamps inside cut regions are rejected before FFmpeg runs.
- Cut ranges must be inside the source video duration.
- Overlapping or adjacent cut ranges are merged before rendering.
- If the source file has audio, the renderer trims and concatenates audio with the video.
- If the source has no audio, the renderer writes a video-only `.mov`.
