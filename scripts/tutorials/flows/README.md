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

Convert the resulting movie to a GIF:

```bash
pnpm mobile:tutorial:ios:gif tutorial-artifacts/ios/tip-calculator/<timestamp>/raw.mov
```

Useful conversion options:

```bash
pnpm mobile:tutorial:ios:gif raw.mov --output tip-calculator.gif --start 0.8 --duration 5.5 --fps 12 --width 480
```
