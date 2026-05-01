# Manual iOS Tutorial Recording

Record a booted iOS Simulator by hand:

```bash
pnpm mobile:tutorial:ios:record tip-calculator --open
```

This starts `simctl recordVideo` and waits until you press Enter. It writes:

```text
tutorial-artifacts/ios/<flow-id>/<timestamp>/raw.mov
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
