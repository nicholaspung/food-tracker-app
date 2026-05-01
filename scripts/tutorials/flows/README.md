# iOS Tutorial Recording

Run the interactive recorder from the repo root:

```bash
pnpm mobile:tutorial:ios:record
```

Choose a tutorial from the numbered menu. The recorder prints the selected
tutorial, the manual in-app navigation path, and the output directory before it
starts recording.

For repeat recordings, pass a flow slug directly:

```bash
pnpm mobile:tutorial:ios:record tip-calculator --open
```

List all available flow slugs:

```bash
pnpm mobile:tutorial:ios:record --list
```

The command starts `simctl recordVideo` and waits until you press Enter. It writes:

```text
tutorial-artifacts/ios/<flow-slug>/<timestamp>/raw.mov
```

The recorder uses the first booted simulator. If no simulator is booted, it boots
the default simulator from the script. While recording, manually click around the
app, then press Enter in the terminal to stop.

Create the final tutorial media in the video annotation web app:

```bash
pnpm video-annotation:dev
```

Then open the printed localhost URL and:

1. Load the recorded `raw.mov`.
2. Add any cuts and tap annotations.
3. Click `Export MOV`.
4. Review the rendered preview.
5. Click `Export GIF`.
