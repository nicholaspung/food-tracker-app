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
