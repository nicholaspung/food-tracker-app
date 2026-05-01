#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const TOOL_DIR = dirname(__filename);
const REPO_ROOT = resolve(TOOL_DIR, '../../..');
const RENDER_SCRIPT = join(TOOL_DIR, 'render.py');
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.VIDEO_ANNOTATION_PORT || '8765', 10);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mov', 'video/quicktime'],
  ['.gif', 'image/gif'],
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function userInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

function sanitizeMovFilename(value, fallback = 'output.mov') {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const filename = basename(raw);
  if (filename !== raw || filename.includes('/') || filename.includes('\\')) {
    throw userInputError('Output filename must not include a path.');
  }
  if (!filename.toLowerCase().endsWith('.mov')) {
    throw userInputError('Output filename must end in .mov.');
  }
  if (filename === '.mov' || filename.includes('\0')) {
    throw userInputError('Output filename is invalid.');
  }
  return filename;
}

function sanitizeGifFilename(value, fallback = 'output.gif') {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const filename = basename(raw);
  if (filename !== raw || filename.includes('/') || filename.includes('\\')) {
    throw userInputError('Output filename must not include a path.');
  }
  if (!filename.toLowerCase().endsWith('.gif')) {
    throw userInputError('Output filename must end in .gif.');
  }
  if (filename === '.gif' || filename.includes('\0')) {
    throw userInputError('Output filename is invalid.');
  }
  return filename;
}

function sanitizeUploadFilename(value) {
  const filename = basename(typeof value === 'string' && value.trim() ? value.trim() : 'input.mov');
  return filename.includes('\0') ? 'input.mov' : filename;
}

function optionalNumber(value, label, defaultValue, min, max) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw userInputError(`${label} must be a number from ${min} to ${max}.`);
  }
  return String(number);
}

function optionalInteger(value, label, defaultValue, min, max) {
  if (value === null || value === undefined || value === '') {
    return String(defaultValue);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw userInputError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return String(number);
}

function optionalPositiveNumber(value, label, min, inclusiveMin = true) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  const valid = inclusiveMin ? number >= min : number > min;
  if (!Number.isFinite(number) || !valid) {
    throw userInputError(`${label} must be ${inclusiveMin ? 'at least' : 'greater than'} ${min}.`);
  }
  return String(number);
}

function optionalColor(value) {
  if (value === null || value === undefined || value === '') {
    return 'white';
  }
  const color = String(value).trim();
  if (!/^(white|black|red|blue|yellow|#?[0-9a-fA-F]{6})$/.test(color)) {
    throw userInputError('Ripple color must be white, black, red, blue, yellow, or a 6-digit hex color.');
  }
  return color;
}

function requiredNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw userInputError(`${label} must be a number from ${min} to ${max}.`);
  }
  return number;
}

function requiredInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw userInputError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function sanitizePngFilename(value, fallback) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const filename = basename(raw);
  if (filename !== raw || filename.includes('/') || filename.includes('\\')) {
    throw userInputError('Frame filename must not include a path.');
  }
  if (!filename.toLowerCase().endsWith('.png')) {
    throw userInputError('Frame filename must end in .png.');
  }
  if (filename === '.png' || filename.includes('\0')) {
    throw userInputError('Frame filename is invalid.');
  }
  return filename;
}

function escapeConcatPath(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "'\\''");
}

function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const details = stderr.trim() || stdout.trim() || `${command} exited with status ${code}.`;
      const error = new Error(details);
      error.statusCode = 400;
      reject(error);
    });
  });
}

function runRenderer(args) {
  return runCommand('python3', args);
}

async function parseMultipart(req) {
  const request = new Request(`http://${HOST}:${PORT}/api/render`, {
    method: req.method,
    headers: requestHeaders(req),
    body: Readable.toWeb(req),
    duplex: 'half',
  });
  return request.formData();
}

async function handleRender(req, res) {
  let tempDir;

  try {
    const form = await parseMultipart(req);
    const video = form.get('video');
    const annotations = form.get('annotations');

    if (!(video instanceof File)) {
      sendJson(res, 400, { error: 'Video file is required.' });
      return;
    }
    if (typeof annotations !== 'string' || !annotations.trim()) {
      sendJson(res, 400, { error: 'Annotation JSON is required.' });
      return;
    }

    const outputFilename = sanitizeMovFilename(form.get('outputFilename'), 'output.mov');
    const rippleDuration = optionalNumber(form.get('rippleDuration'), 'Ripple duration', '0.6', 0.01, 30);
    const rippleRadius = optionalNumber(form.get('rippleRadius'), 'Ripple radius', '44', 1, 1000);
    const rippleOpacity = optionalNumber(form.get('rippleOpacity'), 'Ripple opacity', '0.85', 0, 1);
    const rippleColor = optionalColor(form.get('rippleColor'));

    tempDir = await mkdtemp(join(tmpdir(), 'video-annotation-'));
    const videoPath = join(tempDir, sanitizeUploadFilename(video.name));
    const annotationsPath = join(tempDir, 'annotations.json');
    const outputPath = join(tempDir, outputFilename);

    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));
    await writeFile(annotationsPath, annotations, 'utf8');

    await runRenderer([
      RENDER_SCRIPT,
      videoPath,
      annotationsPath,
      '--output',
      outputPath,
      '--ripple-duration',
      rippleDuration,
      '--ripple-radius',
      rippleRadius,
      '--ripple-color',
      rippleColor,
      '--ripple-opacity',
      rippleOpacity,
    ]);

    const outputStats = await stat(outputPath);
    res.writeHead(200, {
      'content-type': 'video/quicktime',
      'content-length': outputStats.size,
      'content-disposition': `attachment; filename="${outputFilename.replaceAll('"', '')}"`,
    });

    const stream = createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });
    stream.on('error', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Could not stream rendered MOV.' });
      } else {
        res.destroy();
      }
    });
    tempDir = undefined;
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Render failed.';
    sendJson(res, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function handleGif(req, res) {
  let tempDir;

  try {
    const form = await parseMultipart(req);
    const video = form.get('video');

    if (!(video instanceof File)) {
      sendJson(res, 400, { error: 'Video file is required.' });
      return;
    }

    const baseName = sanitizeUploadFilename(video.name).replace(/\.[^.]+$/, '') || 'output';
    const outputFilename = sanitizeGifFilename(form.get('outputFilename'), `${baseName}.gif`);
    const fps = optionalInteger(form.get('fps'), 'FPS', 12, 1, 60);
    const width = optionalInteger(form.get('width'), 'Width', 480, 120, 2160);
    const start = optionalPositiveNumber(form.get('start'), 'Start', 0, true);
    const duration = optionalPositiveNumber(form.get('duration'), 'Duration', 0, false);

    tempDir = await mkdtemp(join(tmpdir(), 'video-annotation-gif-'));
    const videoPath = join(tempDir, sanitizeUploadFilename(video.name));
    const outputPath = join(tempDir, outputFilename);

    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));

    const ffmpegArgs = ['-y'];
    if (start !== null) {
      ffmpegArgs.push('-ss', start);
    }
    ffmpegArgs.push('-i', videoPath);
    if (duration !== null) {
      ffmpegArgs.push('-t', duration);
    }
    ffmpegArgs.push(
      '-filter_complex',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      outputPath,
    );

    await runCommand('ffmpeg', ffmpegArgs);

    const outputStats = await stat(outputPath);
    res.writeHead(200, {
      'content-type': 'image/gif',
      'content-length': outputStats.size,
      'content-disposition': `attachment; filename="${outputFilename.replaceAll('"', '')}"`,
    });

    const stream = createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });
    stream.on('error', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Could not stream generated GIF.' });
      } else {
        res.destroy();
      }
    });
    tempDir = undefined;
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'GIF conversion failed.';
    sendJson(res, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function parseScreenshotGifPayload(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw userInputError('Frames payload is required.');
  }

  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    throw userInputError('Frames payload must be valid JSON.');
  }

  if (!payload || typeof payload !== 'object' || payload.version !== 1) {
    throw userInputError('Frames payload must be a version 1 object.');
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw userInputError('At least one screenshot frame is required.');
  }

  const outputFilename = sanitizeGifFilename(payload.outputFilename, 'screenshots.gif');
  const fps = requiredInteger(payload.fps, 'FPS', 1, 60);
  const width = requiredInteger(payload.width, 'Width', 120, 2160);
  const defaultFrameDuration = requiredNumber(payload.defaultFrameDuration, 'Default frame duration', 0.05, 30);
  const rippleDuration = requiredNumber(payload.rippleDuration, 'Ripple duration', 0.01, 30);
  const rippleRadius = requiredNumber(payload.rippleRadius, 'Ripple radius', 1, 1000);
  const rippleOpacity = requiredNumber(payload.rippleOpacity, 'Ripple opacity', 0, 1);
  const rippleColor = optionalColor(payload.rippleColor);

  const items = payload.items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw userInputError(`Frame ${index + 1} is invalid.`);
    }

    const filename = sanitizePngFilename(item.filename, `frame-${String(index + 1).padStart(3, '0')}.png`);
    const duration = requiredNumber(item.duration ?? defaultFrameDuration, `Frame ${index + 1} duration`, 0.05, 30);
    let tap = null;

    if (item.tap !== null && item.tap !== undefined) {
      if (!item.tap || typeof item.tap !== 'object') {
        throw userInputError(`Frame ${index + 1} tap is invalid.`);
      }
      tap = {
        x: requiredNumber(item.tap.x, `Frame ${index + 1} tap x`, 0, 1),
        y: requiredNumber(item.tap.y, `Frame ${index + 1} tap y`, 0, 1),
      };
    }

    return {
      id: typeof item.id === 'string' && item.id ? item.id : `frame-${index + 1}`,
      filename,
      duration,
      tap,
    };
  });

  return {
    outputFilename,
    fps,
    width,
    defaultFrameDuration,
    rippleDuration,
    rippleRadius,
    rippleOpacity,
    rippleColor,
    items,
  };
}

function parseMixedGifPayload(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw userInputError('Items payload is required.');
  }

  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    throw userInputError('Items payload must be valid JSON.');
  }

  if (!payload || typeof payload !== 'object' || payload.version !== 1) {
    throw userInputError('Items payload must be a version 1 object.');
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw userInputError('At least one mixed GIF item is required.');
  }

  const outputFilename = sanitizeGifFilename(payload.outputFilename, 'mixed.gif');
  const fps = requiredInteger(payload.fps, 'FPS', 1, 60);
  const width = requiredInteger(payload.width, 'Width', 120, 2160);
  const defaultScreenshotDuration = requiredNumber(payload.defaultScreenshotDuration, 'Default screenshot duration', 0.05, 30);
  const rippleDuration = requiredNumber(payload.rippleDuration, 'Ripple duration', 0.01, 30);
  const rippleRadius = requiredNumber(payload.rippleRadius, 'Ripple radius', 1, 1000);
  const rippleOpacity = requiredNumber(payload.rippleOpacity, 'Ripple opacity', 0, 1);
  const rippleColor = optionalColor(payload.rippleColor);

  const items = payload.items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw userInputError(`Item ${index + 1} is invalid.`);
    }

    const id = typeof item.id === 'string' && item.id ? item.id : `item-${index + 1}`;

    if (item.type === 'screenshot') {
      const filename = sanitizePngFilename(item.filename, `frame-${String(index + 1).padStart(3, '0')}.png`);
      const duration = requiredNumber(
        item.duration ?? defaultScreenshotDuration,
        `Item ${index + 1} screenshot duration`,
        0.05,
        30,
      );
      let tap = null;
      const tapTiming = item.tapTiming === undefined || item.tapTiming === null ? 'start' : String(item.tapTiming);
      if (!['start', 'before-next'].includes(tapTiming)) {
        throw userInputError(`Item ${index + 1} tap timing must be start or before-next.`);
      }

      if (item.tap !== null && item.tap !== undefined) {
        if (!item.tap || typeof item.tap !== 'object') {
          throw userInputError(`Item ${index + 1} tap is invalid.`);
        }
        tap = {
          x: requiredNumber(item.tap.x, `Item ${index + 1} tap x`, 0, 1),
          y: requiredNumber(item.tap.y, `Item ${index + 1} tap y`, 0, 1),
        };
      }

      return {
        id,
        type: 'screenshot',
        filename,
        duration,
        tap,
        tapTiming,
      };
    }

    if (item.type === 'clip') {
      const start = requiredNumber(item.start, `Item ${index + 1} clip start`, 0, Number.MAX_SAFE_INTEGER);
      const end = requiredNumber(item.end, `Item ${index + 1} clip end`, 0, Number.MAX_SAFE_INTEGER);
      const speed = requiredNumber(item.speed ?? 1, `Item ${index + 1} clip speed`, 0.25, 4);
      if (end <= start) {
        throw userInputError(`Item ${index + 1} clip must have start < end.`);
      }
      if (end - start < 0.05) {
        throw userInputError(`Item ${index + 1} clip must be at least 0.05 seconds.`);
      }

      const tapsData = item.taps === undefined || item.taps === null ? [] : item.taps;
      if (!Array.isArray(tapsData)) {
        throw userInputError(`Item ${index + 1} clip taps must be an array.`);
      }
      const taps = tapsData.map((tap, tapIndex) => {
        if (!tap || typeof tap !== 'object') {
          throw userInputError(`Item ${index + 1} clip tap ${tapIndex + 1} is invalid.`);
        }
        const timestamp = requiredNumber(tap.timestamp, `Item ${index + 1} clip tap ${tapIndex + 1} timestamp`, 0, Number.MAX_SAFE_INTEGER);
        if (timestamp < start || timestamp >= end) {
          throw userInputError(`Item ${index + 1} clip tap ${tapIndex + 1} timestamp must be inside the clip range.`);
        }
        return {
          id: typeof tap.id === 'string' && tap.id ? tap.id : `tap-${tapIndex + 1}`,
          timestamp,
          x: requiredNumber(tap.x, `Item ${index + 1} clip tap ${tapIndex + 1} x`, 0, 1),
          y: requiredNumber(tap.y, `Item ${index + 1} clip tap ${tapIndex + 1} y`, 0, 1),
        };
      });

      return {
        id,
        type: 'clip',
        start,
        end,
        speed,
        taps,
      };
    }

    throw userInputError(`Item ${index + 1} type must be screenshot or clip.`);
  });

  return {
    outputFilename,
    fps,
    width,
    defaultScreenshotDuration,
    rippleDuration,
    rippleRadius,
    rippleOpacity,
    rippleColor,
    items,
  };
}

async function probeVideoDuration(videoPath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,width,height',
    '-of',
    'json',
    videoPath,
  ]);

  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw userInputError('Could not parse ffprobe output.');
  }

  const streams = Array.isArray(data.streams) ? data.streams : [];
  const videoStream = streams.find((stream) => stream && stream.codec_type === 'video');
  const duration = Number(data?.format?.duration);
  const width = Number(videoStream?.width);
  const height = Number(videoStream?.height);

  if (!videoStream || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw userInputError('Source video has invalid or missing duration/dimensions.');
  }

  return { duration, width, height };
}

function ffexpr(value) {
  const fixed = Number(value).toFixed(6);
  return fixed.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function escapeFfmpegExpr(expr) {
  return expr.replaceAll(',', '\\,');
}

function parseFfmpegRgbColor(value) {
  const named = new Map([
    ['white', 'ffffff'],
    ['black', '000000'],
    ['red', 'ff0000'],
    ['blue', '1667d9'],
    ['yellow', 'f5b400'],
  ]);
  const color = optionalColor(value);
  const hex = named.get(color.toLowerCase()) || color.replace(/^#/, '');

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function geqTimedComponentExpr({ source, colorValue, tap, startTime, rippleDuration, rippleRadius, rippleOpacity }) {
  const duration = ffexpr(rippleDuration);
  const maxRadius = ffexpr(rippleRadius);
  const opacity = ffexpr(rippleOpacity);
  const centerX = `W*${ffexpr(tap.x)}`;
  const centerY = `H*${ffexpr(tap.y)}`;
  const color = ffexpr(colorValue);
  const start = ffexpr(startTime);

  const progress = `((T-${start})/${duration})`;
  const radius = `(6+(${maxRadius}-6)*${progress})`;
  const alpha = `(${opacity}*(1-${progress}))`;
  const distance = `hypot(X-${centerX},Y-${centerY})`;
  const ring = `(between(T,${start},${start}+${duration})*lte(abs(${distance}-${radius}),4))`;
  const blended = `(${source}(X,Y)*(1-${alpha})+${color}*${alpha})`;

  return escapeFfmpegExpr(`if(${ring},${blended},${source}(X,Y))`);
}

function appendTapOverlayFilters(filters, taps, { rippleDuration, rippleRadius, rippleOpacity, rippleColor }) {
  if (taps.length > 0) {
    const { r, g, b } = parseFfmpegRgbColor(rippleColor);
    filters.push('format=rgb24');

    for (const tap of taps) {
      const timedTap = { x: tap.x, y: tap.y };
      const red = geqTimedComponentExpr({
        source: 'r',
        colorValue: r,
        tap: timedTap,
        startTime: tap.startTime,
        rippleDuration,
        rippleRadius,
        rippleOpacity,
      });
      const green = geqTimedComponentExpr({
        source: 'g',
        colorValue: g,
        tap: timedTap,
        startTime: tap.startTime,
        rippleDuration,
        rippleRadius,
        rippleOpacity,
      });
      const blue = geqTimedComponentExpr({
        source: 'b',
        colorValue: b,
        tap: timedTap,
        startTime: tap.startTime,
        rippleDuration,
        rippleRadius,
        rippleOpacity,
      });
      filters.push(`geq=r='${red}':g='${green}':b='${blue}'`);
    }
  }
}

function buildScreenshotFrameFilter({ width, tap, tapStartTime = 0, rippleDuration, rippleRadius, rippleOpacity, rippleColor }) {
  const filters = [`scale=${width}:-2:flags=lanczos`, 'setsar=1'];
  appendTapOverlayFilters(
    filters,
    tap ? [{ ...tap, startTime: tapStartTime }] : [],
    { rippleDuration, rippleRadius, rippleOpacity, rippleColor },
  );

  filters.push('format=yuv420p');
  return filters.join(',');
}

function buildClipFrameFilter({ width, item, rippleDuration, rippleRadius, rippleOpacity, rippleColor }) {
  const filters = [
    `trim=start=${ffexpr(item.start)}:end=${ffexpr(item.end)}`,
    `setpts=(PTS-STARTPTS)/${ffexpr(item.speed)}`,
    `scale=${width}:-2:flags=lanczos`,
    'setsar=1',
  ];
  const taps = item.taps.map((tap) => ({
    ...tap,
    startTime: (tap.timestamp - item.start) / item.speed,
  }));
  appendTapOverlayFilters(filters, taps, { rippleDuration, rippleRadius, rippleOpacity, rippleColor });
  filters.push('format=yuv420p');
  return filters.join(',');
}

async function streamGeneratedGif(res, outputPath, outputFilename, tempDir) {
  const outputStats = await stat(outputPath);
  res.writeHead(200, {
    'content-type': 'image/gif',
    'content-length': outputStats.size,
    'content-disposition': `attachment; filename="${outputFilename.replaceAll('"', '')}"`,
  });

  const stream = createReadStream(outputPath);
  stream.pipe(res);
  stream.on('close', () => {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
  stream.on('error', () => {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Could not stream generated GIF.' });
    } else {
      res.destroy();
    }
  });
}

async function handleScreenshotGif(req, res) {
  let tempDir;

  try {
    const form = await parseMultipart(req);
    const payload = parseScreenshotGifPayload(form.get('frames'));

    tempDir = await mkdtemp(join(tmpdir(), 'video-annotation-screenshot-gif-'));
    const segmentPaths = [];

    for (const [index, item] of payload.items.entries()) {
      const frameFile = form.get(item.filename);
      if (!(frameFile instanceof File)) {
        throw userInputError(`Frame file is required for ${item.filename}.`);
      }

      const framePath = join(tempDir, item.filename);
      const segmentPath = join(tempDir, `segment-${String(index + 1).padStart(3, '0')}.mp4`);
      await writeFile(framePath, Buffer.from(await frameFile.arrayBuffer()));

      await runCommand('ffmpeg', [
        '-y',
        '-loop',
        '1',
        '-t',
        String(item.duration),
        '-i',
        framePath,
        '-vf',
        buildScreenshotFrameFilter({
          width: payload.width,
          tap: item.tap,
          rippleDuration: payload.rippleDuration,
          rippleRadius: payload.rippleRadius,
          rippleOpacity: payload.rippleOpacity,
          rippleColor: payload.rippleColor,
        }),
        '-r',
        String(payload.fps),
        '-an',
        '-movflags',
        '+faststart',
        segmentPath,
      ]);

      segmentPaths.push(segmentPath);
    }

    const concatPath = join(tempDir, 'segments.txt');
    const concatBody = segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join('\n');
    await writeFile(concatPath, `${concatBody}\n`, 'utf8');

    const outputPath = join(tempDir, payload.outputFilename);
    await runCommand('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-filter_complex',
      `fps=${payload.fps},scale=${payload.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      outputPath,
    ]);

    await streamGeneratedGif(res, outputPath, payload.outputFilename, tempDir);
    tempDir = undefined;
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Screenshot GIF conversion failed.';
    sendJson(res, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function handleMixedGif(req, res) {
  let tempDir;

  try {
    const form = await parseMultipart(req);
    const payload = parseMixedGifPayload(form.get('items'));
    const hasClipItems = payload.items.some((item) => item.type === 'clip');
    const video = form.get('video');

    if (hasClipItems && !(video instanceof File)) {
      sendJson(res, 400, { error: 'Video file is required when mixed GIF items include clips.' });
      return;
    }

    tempDir = await mkdtemp(join(tmpdir(), 'video-annotation-mixed-gif-'));
    let videoPath = null;

    if (video instanceof File) {
      videoPath = join(tempDir, sanitizeUploadFilename(video.name));
      await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));
    }

    if (hasClipItems) {
      const videoInfo = await probeVideoDuration(videoPath);
      for (const [index, item] of payload.items.entries()) {
        if (item.type === 'clip' && item.end > videoInfo.duration) {
          throw userInputError(
            `Item ${index + 1} clip ends after the source video duration (${item.end.toFixed(3)}s > ${videoInfo.duration.toFixed(3)}s).`,
          );
        }
      }
    }

    const segmentPaths = [];

    for (const [index, item] of payload.items.entries()) {
      const segmentPath = join(tempDir, `mixed-segment-${String(index + 1).padStart(3, '0')}.mp4`);

      if (item.type === 'screenshot') {
        const frameFile = form.get(item.filename);
        if (!(frameFile instanceof File)) {
          throw userInputError(`Frame file is required for ${item.filename}.`);
        }

        const framePath = join(tempDir, item.filename);
        await writeFile(framePath, Buffer.from(await frameFile.arrayBuffer()));

        await runCommand('ffmpeg', [
          '-y',
          '-loop',
          '1',
          '-t',
          String(item.duration),
          '-i',
          framePath,
          '-vf',
          buildScreenshotFrameFilter({
            width: payload.width,
            tap: item.tap,
            tapStartTime: item.tapTiming === 'before-next'
              ? Math.max(0, item.duration - payload.rippleDuration)
              : 0,
            rippleDuration: payload.rippleDuration,
            rippleRadius: payload.rippleRadius,
            rippleOpacity: payload.rippleOpacity,
            rippleColor: payload.rippleColor,
          }),
          '-r',
          String(payload.fps),
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          segmentPath,
        ]);
      } else {
        await runCommand('ffmpeg', [
          '-y',
          '-i',
          videoPath,
          '-vf',
          buildClipFrameFilter({
            width: payload.width,
            item,
            rippleDuration: payload.rippleDuration,
            rippleRadius: payload.rippleRadius,
            rippleOpacity: payload.rippleOpacity,
            rippleColor: payload.rippleColor,
          }),
          '-r',
          String(payload.fps),
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          segmentPath,
        ]);
      }

      segmentPaths.push(segmentPath);
    }

    const concatPath = join(tempDir, 'segments.txt');
    const concatBody = segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join('\n');
    await writeFile(concatPath, `${concatBody}\n`, 'utf8');

    const combinedPath = join(tempDir, 'combined.mp4');
    await runCommand('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      combinedPath,
    ]);

    const outputPath = join(tempDir, payload.outputFilename);
    await runCommand('ffmpeg', [
      '-y',
      '-i',
      combinedPath,
      '-filter_complex',
      `fps=${payload.fps},scale=${payload.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      outputPath,
    ]);

    await streamGeneratedGif(res, outputPath, payload.outputFilename, tempDir);
    tempDir = undefined;
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Mixed GIF conversion failed.';
    sendJson(res, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function handleClipPreview(req, res) {
  let tempDir;

  try {
    const form = await parseMultipart(req);
    const video = form.get('video');

    if (!(video instanceof File)) {
      sendJson(res, 400, { error: 'Video file is required.' });
      return;
    }

    const start = requiredNumber(form.get('start'), 'Start', 0, Number.MAX_SAFE_INTEGER);
    const end = requiredNumber(form.get('end'), 'End', 0, Number.MAX_SAFE_INTEGER);
    const speed = requiredNumber(form.get('speed') || 1, 'Speed', 0.25, 4);
    const width = requiredInteger(form.get('width') || 720, 'Width', 120, 2160);

    if (end <= start) {
      throw userInputError('Clip preview must have start < end.');
    }
    if (end - start < 0.05) {
      throw userInputError('Clip preview must be at least 0.05 seconds.');
    }

    tempDir = await mkdtemp(join(tmpdir(), 'video-annotation-clip-preview-'));
    const videoPath = join(tempDir, sanitizeUploadFilename(video.name));
    const outputPath = join(tempDir, 'clip-preview.mp4');

    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));

    const videoInfo = await probeVideoDuration(videoPath);
    if (end > videoInfo.duration) {
      throw userInputError(`Clip preview ends after the source video duration (${end.toFixed(3)}s > ${videoInfo.duration.toFixed(3)}s).`);
    }

    await runCommand('ffmpeg', [
      '-y',
      '-i',
      videoPath,
      '-vf',
      [
        `trim=start=${ffexpr(start)}:end=${ffexpr(end)}`,
        `setpts=(PTS-STARTPTS)/${ffexpr(speed)}`,
        `scale=${width}:-2:flags=lanczos`,
        'setsar=1',
        'format=yuv420p',
      ].join(','),
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    const outputStats = await stat(outputPath);
    res.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': outputStats.size,
      'content-disposition': 'inline; filename="clip-preview.mp4"',
    });

    const stream = createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });
    stream.on('error', () => {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Could not stream clip preview.' });
      } else {
        res.destroy();
      }
    });
    tempDir = undefined;
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Clip preview failed.';
    sendJson(res, statusCode, { error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(TOOL_DIR, `.${requestedPath}`);
  const toolPrefix = `${TOOL_DIR}${sep}`;

  if (filePath !== TOOL_DIR && !filePath.startsWith(toolPrefix)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'content-length': body.length,
    });
    res.end(body);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    sendJson(res, 500, { error: 'Could not read local file.' });
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url && req.url.startsWith('/api/render')) {
    handleRender(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Render failed.',
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/api/gif')) {
    handleGif(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'GIF conversion failed.',
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/api/screenshot-gif')) {
    handleScreenshotGif(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Screenshot GIF conversion failed.',
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/api/mixed-gif')) {
    handleMixedGif(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Mixed GIF conversion failed.',
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/api/clip-preview')) {
    handleClipPreview(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Clip preview failed.',
      });
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Could not serve local file.',
      });
    });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
});

server.listen(PORT, HOST, () => {
  console.log(`Video annotation tool: http://${HOST}:${PORT}/`);
});
