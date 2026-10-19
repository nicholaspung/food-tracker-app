# iOS Tutorial Recording

Use isolated synthetic accounts and a demo-only photo library. Never record live invitation codes, personal visits, or real account details. Keep raw recordings local and review every frame before publishing exported media.

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

Create the final tutorial media in the tools app:

```bash
pnpm tools:dev
```

Then open the printed localhost URL and:

1. Open the matching source video from `tutorial-artifacts`.
2. Add screenshots, clips, tap placement, and timeline ordering.
3. Generate and review the GIF preview.
4. Save the GIF export to the local tools asset library.
