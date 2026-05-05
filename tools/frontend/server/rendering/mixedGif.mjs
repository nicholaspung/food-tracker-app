import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

export function userInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function sanitizeFilename(value, fallback, extension) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const filename = basename(raw);
  if (filename !== raw || filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    throw userInputError('Filename must not include a path.');
  }
  if (!filename.toLowerCase().endsWith(extension)) {
    throw userInputError(`Filename must end in ${extension}.`);
  }
  if (filename === extension) {
    throw userInputError('Filename is invalid.');
  }
  return filename;
}

export function requiredNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw userInputError(`${label} must be a number from ${min} to ${max}.`);
  }
  return number;
}

export function requiredInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw userInputError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function optionalColor(value) {
  if (value === null || value === undefined || value === '') {
    return '#006CFF';
  }
  const color = String(value).trim();
  if (!/^(white|black|red|blue|yellow|#?[0-9a-fA-F]{6})$/.test(color)) {
    throw userInputError('Ripple color must be white, black, red, blue, yellow, or a 6-digit hex color.');
  }
  return color;
}

function ffexpr(value) {
  const fixed = Number(value).toFixed(6);
  return fixed.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function escapeFfmpegExpr(expr) {
  return expr.replaceAll(',', '\\,');
}

function escapeConcatPath(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "'\\''");
}

export function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const details = stderr.trim() || stdout.trim() || `${command} exited with status ${code}.`;
      const error = new Error(details);
      error.statusCode = 400;
      reject(error);
    });
  });
}

export async function probeVideo(videoPath, cwd) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_type,width,height',
    '-of',
    'json',
    videoPath,
  ], cwd);

  const data = JSON.parse(stdout);
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const videoStream = streams.find((stream) => stream?.codec_type === 'video');
  const duration = Number(data?.format?.duration);
  const width = Number(videoStream?.width);
  const height = Number(videoStream?.height);
  const size = Number(data?.format?.size);

  if (!videoStream || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw userInputError('Source video has invalid or missing duration/dimensions.');
  }

  return {
    duration,
    width,
    height,
    size: Number.isFinite(size) ? size : undefined,
  };
}

function parseFfmpegRgbColor(value) {
  const named = new Map([
    ['white', 'ffffff'],
    ['black', '000000'],
    ['red', 'ff0000'],
    ['blue', '006cff'],
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
  const ring = `(between(T,${start},${start}+${duration})*lte(abs(${distance}-${radius}),7))`;
  const blended = `(${source}(X,Y)*(1-${alpha})+${color}*${alpha})`;

  return escapeFfmpegExpr(`if(${ring},${blended},${source}(X,Y))`);
}

function appendTapOverlayFilters(filters, taps, settings) {
  if (taps.length === 0) {
    return;
  }

  const { r, g, b } = parseFfmpegRgbColor(settings.rippleColor);
  filters.push('format=rgb24');

  for (const tap of taps) {
    const red = geqTimedComponentExpr({
      source: 'r',
      colorValue: r,
      tap,
      startTime: tap.startTime,
      rippleDuration: settings.rippleDuration,
      rippleRadius: settings.rippleRadius,
      rippleOpacity: settings.rippleOpacity,
    });
    const green = geqTimedComponentExpr({
      source: 'g',
      colorValue: g,
      tap,
      startTime: tap.startTime,
      rippleDuration: settings.rippleDuration,
      rippleRadius: settings.rippleRadius,
      rippleOpacity: settings.rippleOpacity,
    });
    const blue = geqTimedComponentExpr({
      source: 'b',
      colorValue: b,
      tap,
      startTime: tap.startTime,
      rippleDuration: settings.rippleDuration,
      rippleRadius: settings.rippleRadius,
      rippleOpacity: settings.rippleOpacity,
    });
    filters.push(`geq=r='${red}':g='${green}':b='${blue}'`);
  }
}

function screenshotFilter({ width, tap, tapTiming, duration, settings }) {
  const filters = [`scale=${width}:-2:flags=lanczos`, 'setsar=1'];
  const frameDuration = 1 / Math.max(1, settings.fps || 12);
  const tapStartTime = tapTiming === 'before-next'
    ? Math.max(0, duration - settings.rippleDuration - frameDuration)
    : Math.min(frameDuration, Math.max(0, duration - settings.rippleDuration));
  appendTapOverlayFilters(filters, tap ? [{ ...tap, startTime: tapStartTime }] : [], settings);
  filters.push('format=yuv420p');
  return filters.join(',');
}

function clipFilter({ width, item, settings }) {
  const outputDuration = (item.end - item.start) / item.speed;
  const frameDuration = 1 / Math.max(1, settings.fps || 12);
  const filters = [
    'setpts=PTS-STARTPTS',
    `trim=start=${ffexpr(item.start)}:end=${ffexpr(item.end)}`,
    `setpts=(PTS-STARTPTS)/${ffexpr(item.speed)}`,
    `trim=start=0:duration=${ffexpr(outputDuration)}`,
    'setpts=PTS-STARTPTS',
    `scale=${width}:-2:flags=lanczos`,
    'setsar=1',
  ];
  appendTapOverlayFilters(
    filters,
    item.taps.map((tap) => ({
      ...tap,
      startTime: Math.min(
        Math.max(0, (tap.timestamp - item.start) / item.speed),
        Math.max(0, outputDuration - frameDuration),
      ),
    })),
    settings,
  );
  filters.push('format=yuv420p');
  return filters.join(',');
}

export function parseMixedGifState(state) {
  if (!state || typeof state !== 'object' || state.version !== 1) {
    throw userInputError('Editor state must be a version 1 object.');
  }
  if (!Array.isArray(state.items) || state.items.length === 0) {
    throw userInputError('At least one mixed GIF item is required.');
  }

  const settings = state.exportSettings || {};
  const outputFilename = sanitizeFilename(settings.outputFilename, 'mixed.gif', '.gif');
  const fps = requiredInteger(settings.fps, 'FPS', 1, 60);
  const width = requiredInteger(settings.width, 'Width', 120, 2160);
  const defaultScreenshotDuration = requiredNumber(settings.defaultScreenshotDuration, 'Screenshot duration', 0.05, 30);
  const rippleDuration = requiredNumber(settings.rippleDuration, 'Ripple duration', 0.01, 30);
  const rippleRadius = requiredNumber(settings.rippleRadius, 'Ripple radius', 1, 1000);
  const rippleOpacity = requiredNumber(settings.rippleOpacity, 'Ripple opacity', 0, 1);
  const rippleColor = optionalColor(settings.rippleColor);

  const items = state.items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw userInputError(`Item ${index + 1} is invalid.`);
    }

    const id = typeof item.id === 'string' && item.id ? item.id : `item-${index + 1}`;
    if (item.type === 'screenshot') {
      const duration = requiredNumber(item.duration ?? defaultScreenshotDuration, `Item ${index + 1} screenshot duration`, 0.05, 30);
      const tapTiming = item.tapTiming === 'before-next' ? 'before-next' : 'start';
      const tap = item.tap
        ? {
            x: requiredNumber(item.tap.x, `Item ${index + 1} tap x`, 0, 1),
            y: requiredNumber(item.tap.y, `Item ${index + 1} tap y`, 0, 1),
          }
        : null;

      return {
        id,
        type: 'screenshot',
        assetId: typeof item.assetId === 'string' ? item.assetId : '',
        filename: sanitizeFilename(item.filename || `mixed-frame-${index + 1}.png`, `mixed-frame-${index + 1}.png`, '.png'),
        duration,
        tap,
        tapTiming,
      };
    }

    if (item.type === 'clip') {
      const start = requiredNumber(item.start, `Item ${index + 1} clip start`, 0, Number.MAX_SAFE_INTEGER);
      const end = requiredNumber(item.end, `Item ${index + 1} clip end`, 0, Number.MAX_SAFE_INTEGER);
      const speed = requiredNumber(item.speed ?? 1, `Item ${index + 1} clip speed`, 0.25, 4);
      const sourceKind = item.sourceKind === 'asset_file' ? 'asset_file' : 'source_video';
      const assetId = typeof item.assetId === 'string' ? item.assetId : '';
      if (end <= start || end - start < 0.05) {
        throw userInputError(`Item ${index + 1} clip must be at least 0.05 seconds with start < end.`);
      }
      if (sourceKind === 'asset_file' && !assetId) {
        throw userInputError(`Item ${index + 1} asset-file clip is missing an asset.`);
      }

      return {
        id,
        type: 'clip',
        assetId,
        sourceKind,
        start,
        end,
        speed,
        taps: Array.isArray(item.taps)
          ? item.taps.map((tap, tapIndex) => {
              const timestamp = requiredNumber(tap.timestamp, `Item ${index + 1} clip tap ${tapIndex + 1} timestamp`, start, end);
              return {
                id: typeof tap.id === 'string' && tap.id ? tap.id : `tap-${tapIndex + 1}`,
                timestamp,
                x: requiredNumber(tap.x, `Item ${index + 1} clip tap ${tapIndex + 1} x`, 0, 1),
                y: requiredNumber(tap.y, `Item ${index + 1} clip tap ${tapIndex + 1} y`, 0, 1),
              };
            })
          : [],
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

export async function renderClipMp4({ sourceVideoPath, item, width = 720, cwd }) {
  const tempDir = await mkdtemp(join(tmpdir(), 'tools-clip-'));
  const outputPath = join(tempDir, 'clip.mp4');
  const rawDuration = item.end - item.start;

  try {
    await runCommand('ffmpeg', [
      '-y',
      '-ss',
      ffexpr(item.start),
      '-t',
      ffexpr(rawDuration),
      '-i',
      sourceVideoPath,
      '-vf',
      [
        'setpts=PTS-STARTPTS',
        `setpts=(PTS-STARTPTS)/${ffexpr(item.speed || 1)}`,
        `trim=start=0:duration=${ffexpr(rawDuration / (item.speed || 1))}`,
        'setpts=PTS-STARTPTS',
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
    ], cwd);

    const buffer = await readFile(outputPath);
    const stats = await stat(outputPath);
    return {
      buffer,
      bytes: stats.size,
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function renderMixedGif({ state, sourceVideoPath, screenshotResolver, clipAssetResolver, cwd }) {
  const payload = parseMixedGifState(state);
  const tempDir = await mkdtemp(join(tmpdir(), 'tools-mixed-gif-'));

  try {
    const videoInfo = await probeVideo(sourceVideoPath, cwd);
    for (const [index, item] of payload.items.entries()) {
      if (item.type === 'clip' && item.sourceKind !== 'asset_file' && item.end > videoInfo.duration) {
        throw userInputError(`Item ${index + 1} clip ends after source duration.`);
      }
    }

    const settings = payload;
    const segmentPaths = [];

    for (const [index, item] of payload.items.entries()) {
      const segmentPath = join(tempDir, `segment-${String(index + 1).padStart(3, '0')}.mp4`);

      if (item.type === 'screenshot') {
        const screenshotBuffer = await screenshotResolver(item);
        const framePath = join(tempDir, item.filename);
        await writeFile(framePath, screenshotBuffer);
        await runCommand('ffmpeg', [
          '-y',
          '-loop',
          '1',
          '-t',
          String(item.duration),
          '-i',
          framePath,
          '-vf',
          screenshotFilter({
            width: payload.width,
            tap: item.tap,
            tapTiming: item.tapTiming,
            duration: item.duration,
            settings,
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
        ], cwd);
      } else {
        let clipInputPath = sourceVideoPath;
        let renderItem = item;
        const inputSeekArgs = [];
        if (item.sourceKind === 'asset_file') {
          if (typeof clipAssetResolver !== 'function') {
            throw userInputError(`Item ${index + 1} cannot resolve stored clip asset.`);
          }
          const { buffer } = await clipAssetResolver(item);
          clipInputPath = join(tempDir, `clip-input-${String(index + 1).padStart(3, '0')}.mp4`);
          await writeFile(clipInputPath, buffer);
          const clipInfo = await probeVideo(clipInputPath, cwd);
          if (item.end > clipInfo.duration) {
            throw userInputError(`Item ${index + 1} clip ends after stored clip duration.`);
          }
        } else {
          const rawDuration = item.end - item.start;
          inputSeekArgs.push('-ss', ffexpr(item.start), '-t', ffexpr(rawDuration));
          renderItem = {
            ...item,
            start: 0,
            end: rawDuration,
            taps: item.taps.map((tap) => ({
              ...tap,
              timestamp: Math.min(
                Math.max(0, tap.timestamp - item.start),
                Math.max(0, rawDuration - 0.001),
              ),
            })),
          };
        }
        await runCommand('ffmpeg', [
          '-y',
          ...inputSeekArgs,
          '-i',
          clipInputPath,
          '-vf',
          clipFilter({ width: payload.width, item: renderItem, settings }),
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
        ], cwd);
      }

      segmentPaths.push(segmentPath);
    }

    const concatPath = join(tempDir, 'segments.txt');
    await writeFile(concatPath, `${segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join('\n')}\n`);

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
    ], cwd);

    const outputPath = join(tempDir, payload.outputFilename);
    await runCommand('ffmpeg', [
      '-y',
      '-i',
      combinedPath,
      '-filter_complex',
      `fps=${payload.fps},scale=${payload.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      outputPath,
    ], cwd);

    const stats = await stat(outputPath);
    return {
      outputFilename: payload.outputFilename,
      outputPath,
      bytes: stats.size,
      stream: () => createReadStream(outputPath),
      buffer: () => readFile(outputPath),
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function combineGifBuffers({ inputs, outputFilename, cwd }) {
  if (!Array.isArray(inputs) || inputs.length !== 2) {
    throw userInputError('Exactly two GIF inputs are required.');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'tools-combine-gif-'));
  try {
    const inputPaths = [];
    for (const [index, buffer] of inputs.entries()) {
      const inputPath = join(tempDir, `input-${index + 1}.gif`);
      await writeFile(inputPath, buffer);
      inputPaths.push(inputPath);
    }

    const outputPath = join(tempDir, sanitizeFilename(outputFilename, 'combined.gif', '.gif'));

    await runCommand('ffmpeg', [
      '-y',
      '-i',
      inputPaths[0],
      '-i',
      inputPaths[1],
      '-filter_complex',
      [
        '[0:v]fps=12,scale=480:-2:flags=lanczos,setsar=1,format=rgba[v0]',
        '[1:v]fps=12,scale=480:-2:flags=lanczos,setsar=1,format=rgba[v1]',
        '[v0][v1]concat=n=2:v=1:a=0,split[s0][s1]',
        '[s0]palettegen[p]',
        '[s1][p]paletteuse',
      ].join(';'),
      outputPath,
    ], cwd);

    const buffer = await readFile(outputPath);
    const stats = await stat(outputPath);

    return {
      buffer,
      bytes: stats.size,
      width: 480,
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
