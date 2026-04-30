# iOS Tutorial Flows

Flow files in this directory drive local iOS Simulator tutorial recordings.

Run a flow from the repo root:

```bash
pnpm mobile:tutorial:ios tip-calculator
```

Generated files are written to `tutorial-artifacts/ios/<flow-id>/<timestamp>/`.

## Manual MOV Recording

If the native iOS build is blocked, record just the simulator movie without XCUITest:

```bash
pnpm mobile:tutorial:ios:record tip-calculator
```

This starts `simctl recordVideo` and waits until you press Enter. It writes:

```text
tutorial-artifacts/ios/<flow-id>/<timestamp>/raw.mov
```

After manually editing or trimming the movie, convert it to a GIF:

```bash
pnpm mobile:tutorial:ios:gif tutorial-artifacts/ios/tip-calculator/<timestamp>/raw.mov
```

Useful conversion options:

```bash
pnpm mobile:tutorial:ios:gif raw.mov --output tip-calculator.gif --start 0.8 --duration 5.5 --fps 12 --width 480
```

## Step Types

- `wait`: pause for `ms`.
- `tapElement`: tap a React Native `testID` / accessibility identifier with `id`.
- `tapPoint`: tap normalized screen coordinates with `x` and `y` from `0.0` to `1.0`.
- `swipe`: drag from `startX`/`startY` to `endX`/`endY`, all normalized.
- `typeText`: type `text` into the currently focused field.
- `pressKey`: press `return`, `delete`, or `escape`.
- `assertElement`: wait until an element with `id` exists.

Tap and swipe steps are recorded into `events.json` so the renderer can add animated touch indicators.
