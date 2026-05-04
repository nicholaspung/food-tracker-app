# Tools App

Local-first tutorial asset tooling for Yummy Recs.

## Run

From the repo root:

```bash
pnpm install
cd tools/pocketbase && go mod tidy && cd ../..
pnpm tools:dev
```

Open:

```text
http://localhost:5174
```

The dev script starts:

- Vite tools app on `localhost:5174`
- Tools API gateway on `127.0.0.1:8765`
- Isolated tools PocketBase on `127.0.0.1:8092`

## Data

- Raw simulator videos are referenced from `tutorial-artifacts/ios/*/*/raw.mov`.
- Generated screenshots, clips, and GIF exports are stored in the isolated tools PocketBase data directory at `tools/pb_data`.
- The production app PocketBase data and migrations are not used by this tools app.

## First Tool

The first shipped tool is the Mixed GIF builder. It supports source video selection, screenshot capture, clip creation, timeline ordering, tap placement, GIF preview rendering, and saving GIF exports to the local asset library.
