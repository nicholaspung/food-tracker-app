#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    fps: 12,
    width: 480,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--input':
        options.input = argv[++index];
        break;
      case '--events':
        options.events = argv[++index];
        break;
      case '--overlay':
        options.overlay = argv[++index];
        break;
      case '--gif':
        options.gif = argv[++index];
        break;
      case '--fps':
        options.fps = Number(argv[++index]);
        break;
      case '--width':
        options.width = Number(argv[++index]);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  for (const key of ['input', 'events', 'overlay', 'gif']) {
    if (!options[key]) {
      throw new Error(`Missing required option --${key}`);
    }
  }

  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function getVideoSize(inputPath) {
  const output = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=s=x:p=0',
    inputPath,
  ]);
  const [width, height] = output.split('x').map((value) => Number.parseInt(value, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Could not read video size from ${inputPath}`);
  }
  return { width, height };
}

function escapeExpression(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll(',', '\\,');
}

function buildCircleFilter({ event, index, width, height, fps }) {
  const durationSeconds = Math.max((event.durationMs ?? 450) / 1000, 0.1);
  const startSeconds = Math.max((event.timeMs ?? 0) / 1000, 0);
  const x = Math.round((event.x ?? 0.5) * width);
  const y = Math.round((event.y ?? 0.5) * height);
  const distance = `sqrt((X-${x})*(X-${x})+(Y-${y})*(Y-${y}))`;
  const radius = `14+20*T/${durationSeconds.toFixed(3)}`;
  const fade = `(1-T/${durationSeconds.toFixed(3)})`;
  const alpha = `if(between(${distance},${radius}-4,${radius}+4),255*${fade},if(lte(${distance},${radius}),70*${fade},0))`;

  return [
    `color=c=white@0.0:s=${width}x${height}:r=${fps}:d=${durationSeconds.toFixed(3)}`,
    'format=rgba',
    `geq=r='255':g='255':b='255':a='${escapeExpression(alpha)}'`,
    `setpts=PTS+${startSeconds.toFixed(3)}/TB[tap${index}]`,
  ].join(',');
}

function normalizeEvents(payload) {
  const sourceEvents = Array.isArray(payload.events) ? payload.events : [];
  const events = [];

  for (const event of sourceEvents) {
    if (event.type === 'tap' && Number.isFinite(event.x) && Number.isFinite(event.y)) {
      events.push(event);
    }

    if (
      event.type === 'swipe' &&
      Number.isFinite(event.startX) &&
      Number.isFinite(event.startY) &&
      Number.isFinite(event.endX) &&
      Number.isFinite(event.endY)
    ) {
      events.push({
        ...event,
        type: 'tap',
        durationMs: 450,
        x: event.startX,
        y: event.startY,
      });
      events.push({
        ...event,
        type: 'tap',
        timeMs: (event.timeMs ?? 0) + (event.durationMs ?? 500),
        durationMs: 450,
        x: event.endX,
        y: event.endY,
      });
    }
  }

  return events;
}

function renderOverlay({ input, events, overlay, fps }) {
  const payload = JSON.parse(readFileSync(events, 'utf8'));
  const tapEvents = normalizeEvents(payload);

  if (tapEvents.length === 0) {
    run('ffmpeg', ['-y', '-i', input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', overlay]);
    return;
  }

  const size = getVideoSize(input);
  const filters = ['[0:v]format=rgba[base]'];
  tapEvents.forEach((event, index) => {
    filters.push(buildCircleFilter({ event, index, width: size.width, height: size.height, fps }));
  });

  let previous = 'base';
  tapEvents.forEach((_, index) => {
    const next = index === tapEvents.length - 1 ? 'outv' : `v${index}`;
    filters.push(`[${previous}][tap${index}]overlay=0:0:format=auto:eof_action=pass[${next}]`);
    previous = next;
  });

  run('ffmpeg', [
    '-y',
    '-i',
    input,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[outv]',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    overlay,
  ]);
}

function renderGif({ overlay, gif, fps, width }) {
  const gifFilter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
  run('ffmpeg', ['-y', '-i', overlay, '-filter_complex', gifFilter, gif]);
}

try {
  const options = parseArgs(process.argv.slice(2));
  for (const filePath of [options.input, options.events]) {
    if (!existsSync(filePath)) {
      throw new Error(`Missing input file: ${filePath}`);
    }
  }

  renderOverlay(options);
  renderGif(options);
  console.log(`Rendered ${path.relative(process.cwd(), options.gif)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
