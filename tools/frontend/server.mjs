#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import {
  combineGifBuffers,
  probeVideo,
  renderClipMp4,
  renderMixedGif,
  requiredNumber,
  sanitizeFilename,
  userInputError,
} from './server/rendering/mixedGif.mjs';

const __filename = fileURLToPath(import.meta.url);
const APP_DIR = dirname(__filename);
const REPO_ROOT = resolve(APP_DIR, '../..');
const ARTIFACTS_ROOT = resolve(REPO_ROOT, 'tutorial-artifacts/ios');
const PB_URL = process.env.TOOLS_POCKETBASE_URL || 'http://127.0.0.1:8092';
const HOST = process.env.TOOLS_API_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.TOOLS_API_PORT || '8765', 10);
const MAIN_ONBOARDING_PUBLISHED_ASSETS_PATH = resolve(REPO_ROOT, 'apps/mobile/src/lib/onboardingPublishedAssets.ts');
const MAIN_ONBOARDING_CARD_IDS = [
  'welcome',
  'month_privacy',
  'tutorials',
  'friends',
  'more_tools',
  'lists_intro',
  'bills_tips',
  'settings',
  'support_invites',
];

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
]);

const TUTORIAL_FLOWS = [
  { slug: 'welcome', title: 'Welcome to Yummy Recs', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Welcome to Yummy Recs', mobileAssetFilename: 'getting-started-welcome.gif', mobileAssetKey: 'gettingStartedWelcome', mainOnboardingCardId: 'welcome' },
  { slug: 'month-privacy', title: 'Shared with Breathing Room', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Shared with Breathing Room', mobileAssetFilename: 'getting-started-month-privacy.gif', mobileAssetKey: 'gettingStartedMonthPrivacy', mainOnboardingCardId: 'month_privacy' },
  { slug: 'tutorials', title: 'Watch Feature Tutorials', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Watch Feature Tutorials', mobileAssetFilename: 'getting-started-tutorials.gif', mobileAssetKey: 'gettingStartedTutorials', mainOnboardingCardId: 'tutorials' },
  { slug: 'friends', title: 'Add Friends Intentionally', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Add Friends Intentionally', mobileAssetFilename: 'getting-started-friends.gif', mobileAssetKey: 'gettingStartedFriends', mainOnboardingCardId: 'friends' },
  { slug: 'more-tools', title: 'More Than Tracking', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> More Than Tracking', mobileAssetFilename: 'getting-started-more-tools.gif', mobileAssetKey: 'gettingStartedMoreTools', mainOnboardingCardId: 'more_tools' },
  { slug: 'lists-intro', title: 'Use Lists for Ideas', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Use Lists for Ideas', mobileAssetFilename: 'getting-started-lists-intro.gif', mobileAssetKey: 'gettingStartedListsIntro', mainOnboardingCardId: 'lists_intro' },
  { slug: 'bills-tips', title: 'Split Bills and Calculate Tips', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Split Bills and Calculate Tips', mobileAssetFilename: 'getting-started-bills-tips.gif', mobileAssetKey: 'gettingStartedBillsTips', mainOnboardingCardId: 'bills_tips' },
  { slug: 'settings', title: 'Personalize Your Experience', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Personalize Your Experience', mobileAssetFilename: 'getting-started-settings.gif', mobileAssetKey: 'gettingStartedSettings', mainOnboardingCardId: 'settings' },
  { slug: 'support-invites', title: 'Invite Friends and Get Help', section: 'Getting Started', navigationHint: 'Profile -> Tutorials -> Invite Friends and Get Help', mobileAssetFilename: 'getting-started-support-invites.gif', mobileAssetKey: 'gettingStartedSupportInvites', mainOnboardingCardId: 'support_invites' },
  { slug: 'track-restaurant-visit', title: 'Track Restaurant Visit', section: 'Add Tutorials', navigationHint: 'Profile -> Tutorials -> Track Restaurant Visit', mobileAssetFilename: 'track-restaurant-visit.gif', mobileAssetKey: 'trackRestaurantVisit' },
  { slug: 'track-food-product', title: 'Track Food Product', section: 'Add Tutorials', navigationHint: 'Profile -> Tutorials -> Track Food Product', mobileAssetFilename: 'track-food-product.gif', mobileAssetKey: 'trackFoodProduct' },
  { slug: 'log-note', title: 'Log a Note', section: 'Add Tutorials', navigationHint: 'Profile -> Tutorials -> Log a Note', mobileAssetFilename: 'log-note.gif', mobileAssetKey: 'logNote' },
  { slug: 'process-saved-photos', title: 'Process Saved Photos', section: 'Add Tutorials', navigationHint: 'Profile -> Tutorials -> Process Saved Photos', mobileAssetFilename: 'process-saved-photos.gif', mobileAssetKey: 'processSavedPhotos' },
  { slug: 'manage-notes', title: 'Manage Notes', section: 'Add Tutorials', navigationHint: 'Profile -> Tutorials -> Manage Notes', mobileAssetFilename: 'manage-notes.gif', mobileAssetKey: 'manageNotes' },
  { slug: 'lists', title: 'Restaurant Lists', section: 'More Tutorials', navigationHint: 'Profile -> Tutorials -> Restaurant Lists', mobileAssetFilename: 'lists.gif', mobileAssetKey: 'lists' },
  { slug: 'split-bill', title: 'Split a Bill', section: 'More Tutorials', navigationHint: 'Profile -> Tutorials -> Split a Bill', mobileAssetFilename: 'split-bill.gif', mobileAssetKey: 'splitBill' },
  { slug: 'tip-calculator', title: 'Tip Calculator', section: 'More Tutorials', navigationHint: 'Profile -> Tutorials -> Tip Calculator', mobileAssetFilename: 'tip-calculator.gif', mobileAssetKey: 'tipCalculator' },
];

function findTutorialFlow(slug) {
  return TUTORIAL_FLOWS.find((flow) => flow.slug === slug) || null;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, error, fallback = 'Request failed.') {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  sendJson(res, statusCode, {
    error: error instanceof Error ? error.message : fallback,
    ...(error?.payload && typeof error.payload === 'object' ? error.payload : {}),
  });
}

async function readJsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  if (!body.trim()) {
    return {};
  }
  return JSON.parse(body);
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

async function parseMultipart(req) {
  const request = new Request(`http://${HOST}:${PORT}/api/tools/upload`, {
    method: req.method,
    headers: requestHeaders(req),
    body: Readable.toWeb(req),
    duplex: 'half',
  });
  return request.formData();
}

async function pbRequest(path, options = {}) {
  const response = await fetch(`${PB_URL}${path}`, options);
  if (!response.ok) {
    let message = `PocketBase request failed with ${response.status}.`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Keep default.
    }
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return response;
}

async function pbJson(path, options = {}) {
  const response = await pbRequest(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      ...(options.headers || {}),
    },
  });
  return response.json();
}

function encodeSourceId(path) {
  return Buffer.from(path).toString('base64url');
}

function decodeSourceId(id) {
  const sourcePath = Buffer.from(id, 'base64url').toString('utf8');
  const resolved = resolve(sourcePath);
  const prefix = `${ARTIFACTS_ROOT}${sep}`;
  if (resolved !== ARTIFACTS_ROOT && !resolved.startsWith(prefix)) {
    throw userInputError('Source video is outside tutorial artifacts.');
  }
  return resolved;
}

function assertRawVideoPath(sourcePath) {
  const resolved = resolve(sourcePath);
  const parts = relative(ARTIFACTS_ROOT, resolved).split(sep);
  if (parts.length !== 3 || parts[2] !== 'raw.mov') {
    throw userInputError('Source video must be a tutorial raw.mov recording.');
  }
  if (parts[0] === '_trash') {
    throw userInputError('Source video is already archived.');
  }
  return resolved;
}

function sourceVideoParts(sourcePath) {
  const resolved = assertRawVideoPath(sourcePath);
  const [flowSlug, timestamp] = relative(ARTIFACTS_ROOT, resolved).split(sep);
  return {
    flowSlug,
    timestamp,
    runDir: dirname(resolved),
    videoPath: resolved,
  };
}

function validateFlowSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) {
    throw userInputError('Target flow slug is invalid.');
  }
  if (value === '_trash') {
    throw userInputError('Target flow slug is reserved.');
  }
  return value;
}

async function directoryExists(dirPath) {
  try {
    const fileStats = await stat(dirPath);
    return fileStats.isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function nextAvailableDirectory(baseDir) {
  if (!(await directoryExists(baseDir))) {
    return baseDir;
  }
  for (let index = 2; index <= 100; index += 1) {
    const candidate = `${baseDir}-${index}`;
    if (!(await directoryExists(candidate))) {
      return candidate;
    }
  }
  const error = new Error('Could not find an available destination directory.');
  error.statusCode = 409;
  throw error;
}

async function sourceVideoRecordFromPath(videoPath) {
  const { flowSlug, timestamp } = sourceVideoParts(videoPath);
  const fileStats = await stat(videoPath);
  let videoInfo = {};
  try {
    videoInfo = await probeVideo(videoPath, REPO_ROOT);
  } catch {
    videoInfo = {};
  }
  return {
    id: encodeSourceId(videoPath),
    flowSlug,
    timestamp,
    path: videoPath,
    relativePath: relative(REPO_ROOT, videoPath),
    filename: basename(videoPath),
    size: fileStats.size,
    createdAt: fileStats.birthtime.toISOString(),
    updatedAt: fileStats.mtime.toISOString(),
    duration: videoInfo.duration,
    width: videoInfo.width,
    height: videoInfo.height,
  };
}

async function listFlowSlugs() {
  let entries = [];
  try {
    entries = await readdir(ARTIFACTS_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== '_trash')
    .map((entry) => entry.name)
    .sort();
}

async function findRawVideos() {
  const results = [];
  let flows = [];
  try {
    flows = await readdir(ARTIFACTS_ROOT, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const flow of flows) {
    if (!flow.isDirectory()) {
      continue;
    }
    const flowDir = join(ARTIFACTS_ROOT, flow.name);
    let runs = [];
    try {
      runs = await readdir(flowDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const run of runs) {
      if (!run.isDirectory()) {
        continue;
      }
      const videoPath = join(flowDir, run.name, 'raw.mov');
      try {
        results.push(await sourceVideoRecordFromPath(videoPath));
      } catch {
        // Missing raw.mov for this run.
      }
    }
  }

  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function getProject(projectId) {
  return pbJson(`/api/collections/tool_projects/records/${encodeURIComponent(projectId)}`);
}

async function listAssets(projectId) {
  const filter = encodeURIComponent(`project="${projectId}"`);
  const data = await pbJson(`/api/collections/tool_assets/records?perPage=200&sort=-created&filter=${filter}`);
  return data.items || [];
}

async function listAllAssets() {
  const data = await pbJson('/api/collections/tool_assets/records?perPage=500&sort=-created');
  return data.items || [];
}

async function createAsset({ projectId, kind, filename, mimeType, buffer, metadata = {} }) {
  const form = new FormData();
  form.set('project', projectId);
  form.set('kind', kind);
  form.set('filename', filename);
  form.set('mimeType', mimeType);
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null && value !== '') {
      form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  }
  if (buffer) {
    form.set('bytes', String(buffer.length));
    form.set('file', new Blob([buffer], { type: mimeType }), filename);
  }
  const response = await pbRequest('/api/collections/tool_assets/records', {
    method: 'POST',
    body: form,
  });
  return response.json();
}

async function updateProject(projectId, body) {
  return pbJson(`/api/collections/tool_projects/records/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function resolveAssetFileBuffer(assetId) {
  const record = await pbJson(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`);
  if (!record.file) {
    throw userInputError(`Asset ${assetId} has no stored file.`);
  }
  const response = await pbRequest(`/api/files/tool_assets/${record.id}/${encodeURIComponent(record.file)}`);
  return {
    record,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function resolveScreenshotBuffer(item) {
  if (!item.assetId) {
    throw userInputError(`Screenshot item ${item.id} is missing an asset.`);
  }
  const { buffer } = await resolveAssetFileBuffer(item.assetId);
  return buffer;
}

async function findAssetTimelineReferences(assetId) {
  const data = await pbJson('/api/collections/tool_projects/records?perPage=200');
  const references = [];

  for (const project of data.items || []) {
    const items = Array.isArray(project?.editorState?.items) ? project.editorState.items : [];
    for (const item of items) {
      if (item?.assetId === assetId) {
        references.push({
          projectId: project.id,
          projectName: project.name,
          itemId: typeof item.id === 'string' ? item.id : '',
        });
      }
    }
  }

  return references;
}

async function listPublishedGifAssignments(query = '') {
  const suffix = query ? `&${query}` : '';
  const data = await pbJson(`/api/collections/tool_published_gif_assignments/records?perPage=500&sort=-created${suffix}`);
  return data.items || [];
}

async function listCurrentPublishedGifAssignments() {
  const filter = encodeURIComponent('isCurrent=true');
  return listPublishedGifAssignments(`filter=${filter}`);
}

async function findAssetPublishedReferences(assetId) {
  const filter = encodeURIComponent(`asset="${assetId}"`);
  const assignments = await listPublishedGifAssignments(`filter=${filter}`);
  return assignments.map((assignment) => ({
    assignmentId: assignment.id,
    flowSlug: assignment.flowSlug,
    flowTitle: assignment.flowTitle,
    isCurrent: Boolean(assignment.isCurrent),
  }));
}

async function updateAssignment(assignmentId, body) {
  return pbJson(`/api/collections/tool_published_gif_assignments/records/${encodeURIComponent(assignmentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function createPublishedGifAssignment(body) {
  return pbJson('/api/collections/tool_published_gif_assignments/records', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function copyPublishedGifToMobileAsset(asset, buffer, flow) {
  if (!flow.mobileAssetFilename) {
    return {
      copyStatus: 'tracked_only',
      copiedToPath: '',
      targetRelativePath: '',
      copiedBytes: 0,
      copyError: '',
    };
  }

  const targetRelativePath = join('apps/mobile/assets/onboarding', flow.mobileAssetFilename);
  const targetPath = resolve(REPO_ROOT, targetRelativePath);
  const targetDir = resolve(REPO_ROOT, 'apps/mobile/assets/onboarding');
  const targetPrefix = `${targetDir}${sep}`;
  if (targetPath !== targetDir && !targetPath.startsWith(targetPrefix)) {
    throw userInputError('Published GIF target path is invalid.');
  }

  const tempPath = join(targetDir, `.${flow.mobileAssetFilename}.${Date.now()}.tmp`);
  await writeFile(tempPath, buffer);
  await rename(tempPath, targetPath);
  return {
    copyStatus: 'copied',
    copiedToPath: targetPath,
    targetRelativePath,
    copiedBytes: buffer.length || asset.bytes || 0,
    copyError: '',
  };
}

function parseMainOnboardingPublishedAssets(source) {
  const values = {};
  for (const cardId of MAIN_ONBOARDING_CARD_IDS) {
    const pattern = new RegExp(`\\b${cardId}\\s*:\\s*(true|false)\\b`);
    const match = source.match(pattern);
    if (!match) {
      throw userInputError(`Published asset manifest is missing ${cardId}.`);
    }
    values[cardId] = match[1] === 'true';
  }
  return values;
}

function formatMainOnboardingPublishedAssets(values) {
  const rows = MAIN_ONBOARDING_CARD_IDS
    .map((cardId) => `  ${cardId}: ${values[cardId] ? 'true' : 'false'},`)
    .join('\n');
  return [
    "import type { MainOnboardingCardId } from '../types/onboarding';",
    '',
    'export const MAIN_ONBOARDING_PUBLISHED_ASSETS: Record<MainOnboardingCardId, boolean> = {',
    rows,
    '} as const;',
    '',
  ].join('\n');
}

async function markMainOnboardingGifPublished(flow) {
  if (!flow.mainOnboardingCardId) {
    return;
  }
  if (!MAIN_ONBOARDING_CARD_IDS.includes(flow.mainOnboardingCardId)) {
    throw userInputError(`Unknown main onboarding card id: ${flow.mainOnboardingCardId}.`);
  }

  let source;
  try {
    source = await readFile(MAIN_ONBOARDING_PUBLISHED_ASSETS_PATH, 'utf8');
  } catch (error) {
    throw userInputError('Could not read the mobile onboarding published asset manifest.');
  }

  const values = parseMainOnboardingPublishedAssets(source);
  values[flow.mainOnboardingCardId] = true;
  await writeFile(MAIN_ONBOARDING_PUBLISHED_ASSETS_PATH, formatMainOnboardingPublishedAssets(values));
}

async function assignPublishedGif(flowSlug, body) {
  const flow = findTutorialFlow(flowSlug);
  if (!flow) {
    throw userInputError('Unknown tutorial flow.');
  }
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  if (!assetId) {
    throw userInputError('Choose a GIF asset.');
  }

  const { record: asset, buffer } = await resolveAssetFileBuffer(assetId);
  if (asset.kind !== 'gif_export' || asset.mimeType !== 'image/gif') {
    throw userInputError('Only saved GIF exports can be published.');
  }
  const project = await getProject(asset.project);

  let copyResult;
  try {
    copyResult = await copyPublishedGifToMobileAsset(asset, buffer, flow);
    if (copyResult.copyStatus === 'copied') {
      await markMainOnboardingGifPublished(flow);
    }
  } catch (error) {
    copyResult = {
      copyStatus: 'copy_failed',
      copiedToPath: '',
      targetRelativePath: flow.mobileAssetFilename ? join('apps/mobile/assets/onboarding', flow.mobileAssetFilename) : '',
      copiedBytes: 0,
      copyError: error instanceof Error ? error.message : 'Could not copy GIF to mobile assets.',
    };
  }

  const currentAssignments = await listCurrentPublishedGifAssignments();
  await Promise.all(
    currentAssignments
      .filter((assignment) => assignment.flowSlug === flow.slug)
      .map((assignment) => updateAssignment(assignment.id, { isCurrent: false })),
  );

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 5000) : '';
  const assignment = await createPublishedGifAssignment({
    flowSlug: flow.slug,
    flowTitle: flow.title,
    flowSection: flow.section,
    asset: asset.id,
    project: project.id,
    assetFilename: asset.filename,
    assetFile: asset.file || '',
    sourceProjectName: project.name || '',
    sourceProjectFlowSlug: project.flowSlug || '',
    sourceVideoPath: project.sourceVideoPath || '',
    sourceVideoFilename: project.sourceVideoFilename || '',
    targetRelativePath: copyResult.targetRelativePath,
    copiedToPath: copyResult.copiedToPath,
    copiedBytes: copyResult.copiedBytes,
    copyStatus: copyResult.copyStatus,
    copyError: copyResult.copyError,
    isCurrent: true,
    notes,
  });

  if (copyResult.copyStatus === 'copy_failed') {
    const error = new Error(copyResult.copyError || 'Could not copy GIF to mobile assets.');
    error.statusCode = 500;
    error.payload = { assignment };
    throw error;
  }

  return assignment;
}

async function handlePublishedGifs(_req, res) {
  const history = await listPublishedGifAssignments();
  const current = history.filter((assignment) => assignment.isCurrent);
  sendJson(res, 200, {
    flows: TUTORIAL_FLOWS,
    current,
    history,
  });
}

async function handlePublishedGifAssign(req, res, flowSlug) {
  const assignment = await assignPublishedGif(flowSlug, await readJsonBody(req));
  sendJson(res, 201, { assignment });
}

async function handlePublishedGifHistory(_req, res, flowSlug) {
  const flow = findTutorialFlow(flowSlug);
  if (!flow) {
    throw userInputError('Unknown tutorial flow.');
  }
  const filter = encodeURIComponent(`flowSlug="${flow.slug}"`);
  sendJson(res, 200, { items: await listPublishedGifAssignments(`filter=${filter}`) });
}

async function handleSourceVideos(_req, res) {
  sendJson(res, 200, { items: await findRawVideos() });
}

async function handleSourceVideoStream(req, res, id) {
  const sourcePath = decodeSourceId(id);
  const fileStats = await stat(sourcePath);
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { 'content-range': `bytes */${fileStats.size}` });
      res.end();
      return;
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : fileStats.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileStats.size) {
      res.writeHead(416, { 'content-range': `bytes */${fileStats.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'content-type': 'video/quicktime',
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${fileStats.size}`,
      'accept-ranges': 'bytes',
    });
    createReadStream(sourcePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'content-type': 'video/quicktime',
    'content-length': fileStats.size,
    'accept-ranges': 'bytes',
  });
  createReadStream(sourcePath).pipe(res);
}

async function handleSourceVideoDelete(_req, res, id) {
  const sourcePath = decodeSourceId(id);
  const { flowSlug, timestamp, runDir } = sourceVideoParts(sourcePath);
  let runStats;
  try {
    runStats = await stat(runDir);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const notFound = new Error('Source recording folder was not found.');
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
  if (!runStats.isDirectory()) {
    const error = new Error('Source recording folder was not found.');
    error.statusCode = 404;
    throw error;
  }
  const trashFlowDir = join(ARTIFACTS_ROOT, '_trash', flowSlug);
  await mkdir(trashFlowDir, { recursive: true });
  const archiveDir = await nextAvailableDirectory(join(trashFlowDir, timestamp));
  await rename(runDir, archiveDir);
  sendJson(res, 200, {
    ok: true,
    archivedTo: relative(REPO_ROOT, archiveDir),
  });
}

async function handleSourceVideoMove(req, res, id) {
  const body = await readJsonBody(req);
  if (body.action !== 'move') {
    throw userInputError('Unsupported source video action.');
  }
  const sourcePath = decodeSourceId(id);
  const { flowSlug, timestamp, runDir } = sourceVideoParts(sourcePath);
  const targetFlowSlug = validateFlowSlug(body.targetFlowSlug);
  if (targetFlowSlug === flowSlug) {
    throw userInputError('Choose a different target flow.');
  }
  const flowSlugs = await listFlowSlugs();
  if (!flowSlugs.includes(targetFlowSlug)) {
    throw userInputError('Target flow folder does not exist.');
  }
  const targetFlowDir = join(ARTIFACTS_ROOT, targetFlowSlug);
  const destinationDir = await nextAvailableDirectory(join(targetFlowDir, timestamp));
  await rename(runDir, destinationDir);
  sendJson(res, 200, {
    ok: true,
    sourceVideo: await sourceVideoRecordFromPath(join(destinationDir, 'raw.mov')),
  });
}

async function handleProjects(req, res) {
  if (req.method === 'GET') {
    const data = await pbJson('/api/collections/tool_projects/records?perPage=100&sort=-updated');
    const items = await Promise.all((data.items || []).map(async (project) => ({
      ...project,
      assets: await listAssets(project.id),
    })));
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const project = await pbJson('/api/collections/tool_projects/records', {
      method: 'POST',
      body: JSON.stringify({
        name: body.name,
        toolType: 'mixed_gif',
        flowSlug: body.flowSlug || '',
        sourceVideoPath: body.sourceVideoPath,
        sourceVideoFilename: body.sourceVideoFilename,
        sourceVideoDuration: body.sourceVideoDuration || 0,
        sourceVideoWidth: body.sourceVideoWidth || 0,
        sourceVideoHeight: body.sourceVideoHeight || 0,
        editorState: body.editorState,
        exportSettings: body.exportSettings,
        tags: body.tags || [],
        notes: body.notes || '',
      }),
    });
    await createAsset({
      projectId: project.id,
      kind: 'source_reference',
      filename: body.sourceVideoFilename,
      mimeType: 'video/quicktime',
      metadata: {
        externalPath: body.sourceVideoPath,
        duration: body.sourceVideoDuration || 0,
        width: body.sourceVideoWidth || 0,
        height: body.sourceVideoHeight || 0,
      },
    });
    sendJson(res, 201, { project: { ...project, assets: await listAssets(project.id) } });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function handleProject(req, res, projectId) {
  if (req.method === 'GET') {
    const project = await getProject(projectId);
    sendJson(res, 200, { project: { ...project, assets: await listAssets(projectId) } });
    return;
  }

  if (req.method === 'PATCH') {
    const project = await updateProject(projectId, await readJsonBody(req));
    sendJson(res, 200, { project: { ...project, assets: await listAssets(projectId) } });
    return;
  }

  if (req.method === 'DELETE') {
    await pbRequest(`/api/collections/tool_projects/records/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function handleScreenshotUpload(req, res, projectId) {
  const form = await parseMultipart(req);
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw userInputError('Screenshot PNG file is required.');
  }
  const filename = sanitizeFilename(form.get('filename'), file.name || 'screenshot.png', '.png');
  const asset = await createAsset({
    projectId,
    kind: 'screenshot_png',
    filename,
    mimeType: 'image/png',
    buffer: Buffer.from(await file.arrayBuffer()),
    metadata: {
      itemId: form.get('itemId') || '',
      label: form.get('label') || '',
      sourceTimestamp: form.get('sourceTimestamp') || '',
      metadata: { capturedFrom: form.get('sourceVideoPath') || '' },
    },
  });
  const editorState = form.get('editorState');
  if (typeof editorState === 'string' && editorState.trim()) {
    await updateProject(projectId, { editorState: JSON.parse(editorState) });
  }
  sendJson(res, 201, { asset });
}

async function handleClipCreate(req, res, projectId) {
  const body = await readJsonBody(req);
  const project = await getProject(projectId);
  const item = {
    start: requiredNumber(body.start, 'Clip start', 0, Number.MAX_SAFE_INTEGER),
    end: requiredNumber(body.end, 'Clip end', 0, Number.MAX_SAFE_INTEGER),
    speed: requiredNumber(body.speed ?? 1, 'Clip speed', 0.25, 4),
  };
  if (item.end <= item.start) {
    throw userInputError('Clip start must be before clip end.');
  }
  const filename = sanitizeFilename(body.filename, `${body.itemId || 'clip'}.mp4`, '.mp4');
  const rendered = await renderClipMp4({
    sourceVideoPath: project.sourceVideoPath,
    item,
    width: body.width || 720,
    cwd: REPO_ROOT,
  });
  try {
    const asset = await createAsset({
      projectId,
      kind: 'clip_mp4',
      filename,
      mimeType: 'video/mp4',
      buffer: rendered.buffer,
      metadata: {
        itemId: body.itemId || '',
        sourceStart: item.start,
        sourceEnd: item.end,
        duration: (item.end - item.start) / item.speed,
      },
    });
    if (body.editorState) {
      await updateProject(projectId, { editorState: body.editorState });
    }
    sendJson(res, 201, { asset });
  } finally {
    await rendered.cleanup().catch(() => {});
  }
}

async function handleMixedGif(req, res, projectId, save) {
  const project = await getProject(projectId);
  const body = await readJsonBody(req);
  const state = body.editorState || project.editorState;
  const rendered = await renderMixedGif({
    state,
    sourceVideoPath: project.sourceVideoPath,
    screenshotResolver: resolveScreenshotBuffer,
    clipAssetResolver: async (item) => {
      const { record, buffer } = await resolveAssetFileBuffer(item.assetId);
      if (record.kind !== 'clip_mp4') {
        throw userInputError(`Clip asset ${item.assetId} is not a stored MP4 clip.`);
      }
      return { record, buffer };
    },
    cwd: REPO_ROOT,
  });

  try {
    if (!save) {
      res.writeHead(200, {
        'content-type': 'image/gif',
        'content-length': rendered.bytes,
        'content-disposition': `inline; filename="${rendered.outputFilename.replaceAll('"', '')}"`,
      });
      rendered.stream().pipe(res);
      res.on('close', () => {
        rendered.cleanup().catch(() => {});
      });
      return;
    }

    const buffer = await rendered.buffer();
    const asset = await createAsset({
      projectId,
      kind: 'gif_export',
      filename: rendered.outputFilename,
      mimeType: 'image/gif',
      buffer,
      metadata: {
        label: body.label || 'Final GIF',
        metadata: { itemCount: Array.isArray(state.items) ? state.items.length : 0 },
      },
    });
    await updateProject(projectId, {
      editorState: state,
      exportSettings: state.exportSettings,
    });
    sendJson(res, 201, { asset });
  } finally {
    if (save) {
      await rendered.cleanup().catch(() => {});
    }
  }
}

async function handleGifCombinationCreate(req, res) {
  const body = await readJsonBody(req);
  const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
  if (assetIds.length !== 2 || assetIds.some((id) => typeof id !== 'string' || !id)) {
    throw userInputError('Choose exactly two GIF assets.');
  }

  const filename = sanitizeFilename(body.filename, 'combined.gif', '.gif');
  const projectName = typeof body.projectName === 'string' && body.projectName.trim()
    ? body.projectName.trim().slice(0, 180)
    : filename.replace(/\.gif$/i, '');
  const sourceKey = `combined-gif:${assetIds.join('+')}`;

  const inputs = [];
  const sourceProjects = [];
  for (const assetId of assetIds) {
    const { record, buffer } = await resolveAssetFileBuffer(assetId);
    if (record.kind !== 'gif_export' || record.mimeType !== 'image/gif') {
      throw userInputError('Only saved GIF exports can be combined.');
    }
    inputs.push({ record, buffer });
    sourceProjects.push(await getProject(record.project));
  }

  const rendered = await combineGifBuffers({
    inputs: inputs.map((item) => item.buffer),
    outputFilename: filename,
    cwd: REPO_ROOT,
  });

  try {
    const exportSettings = {
      outputFilename: filename,
      defaultScreenshotDuration: 1.6,
      fps: 12,
      width: rendered.width || 480,
      rippleDuration: 0.75,
      rippleRadius: 58,
      rippleOpacity: 0.95,
      rippleColor: '#006CFF',
    };
    const editorState = {
      version: 1,
      selectedItemId: null,
      sourceVideo: {
        path: sourceKey,
        filename,
        duration: 0,
        width: 0,
        height: 0,
      },
      items: [],
      exportSettings,
    };
    const combinedMetadata = {
      combinedFromAssetIds: assetIds,
      combinedFromProjectIds: sourceProjects.map((project) => project.id),
    };

    const project = await pbJson('/api/collections/tool_projects/records', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        toolType: 'mixed_gif',
        flowSlug: 'combined-gif',
        sourceVideoPath: sourceKey,
        sourceVideoFilename: filename,
        sourceVideoDuration: 0,
        sourceVideoWidth: 0,
        sourceVideoHeight: 0,
        editorState,
        exportSettings,
        tags: ['combined_gif'],
        notes: JSON.stringify(combinedMetadata),
      }),
    });

    const asset = await createAsset({
      projectId: project.id,
      kind: 'gif_export',
      filename,
      mimeType: 'image/gif',
      buffer: rendered.buffer,
      metadata: {
        label: 'Combined GIF',
        metadata: combinedMetadata,
      },
    });

    sendJson(res, 201, { project: { ...project, assets: await listAssets(project.id) }, asset });
  } finally {
    await rendered.cleanup().catch(() => {});
  }
}

async function handleAssets(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { items: await listAllAssets() });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function handleAssetUpdate(req, res, assetId) {
  const body = await readJsonBody(req);
  const record = await pbJson(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`);
  if (record.kind !== 'gif_export' || record.mimeType !== 'image/gif') {
    throw userInputError('Only saved GIF exports can be renamed.');
  }

  const filename = sanitizeFilename(body.filename, record.filename || 'renamed.gif', '.gif');
  const asset = await pbJson(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ filename }),
  });

  const publishedReferences = await listPublishedGifAssignments(
    `filter=${encodeURIComponent(`asset="${assetId}"`)}`,
  );
  await Promise.all(
    publishedReferences.map((assignment) =>
      updateAssignment(assignment.id, { assetFilename: filename }),
    ),
  );

  sendJson(res, 200, { asset });
}

async function handleAssetDelete(_req, res, assetId) {
  const record = await pbJson(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`);
  if (record.kind === 'source_reference') {
    throw userInputError('Source references cannot be deleted from the asset grid.');
  }

  const publishedReferences = await findAssetPublishedReferences(assetId);
  if (publishedReferences.length > 0) {
    const error = new Error('Asset is used by published GIF history.');
    error.statusCode = 409;
    error.payload = { references: publishedReferences, usedBy: publishedReferences };
    throw error;
  }

  const references = await findAssetTimelineReferences(assetId);
  if (references.length > 0) {
    const error = new Error('Asset is used by one or more timeline items.');
    error.statusCode = 409;
    error.payload = { references, usedBy: references };
    throw error;
  }

  await pbRequest(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
  sendJson(res, 200, { ok: true });
}

async function handleAssetFile(_req, res, assetId) {
  const record = await pbJson(`/api/collections/tool_assets/records/${encodeURIComponent(assetId)}`);
  if (!record.file) {
    throw userInputError('Asset does not have a stored file.');
  }
  const response = await pbRequest(`/api/files/tool_assets/${record.id}/${encodeURIComponent(record.file)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    'content-type': record.mimeType || 'application/octet-stream',
    'content-length': buffer.length,
    'content-disposition': `inline; filename="${record.filename.replaceAll('"', '')}"`,
  });
  res.end(buffer);
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const requestedPath = decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const distDir = resolve(APP_DIR, 'dist');
  const filePath = resolve(distDir, `.${requestedPath}`);
  const prefix = `${distDir}${sep}`;
  if (filePath !== distDir && !filePath.startsWith(prefix)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'content-length': body.length,
    });
    res.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const fallbackPath = join(distDir, 'index.html');
      const body = await readFile(fallbackPath);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': body.length,
      });
      res.end(body);
      return;
    }
    throw error;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  Promise.resolve().then(async () => {
    if (pathname === '/api/tools/health') {
      sendJson(res, 200, { ok: true, pocketbaseUrl: PB_URL });
      return;
    }
    if (pathname === '/api/tools/source-videos' && req.method === 'GET') {
      await handleSourceVideos(req, res);
      return;
    }
    const sourceMatch = pathname.match(/^\/api\/tools\/source-videos\/([^/]+)\/stream$/);
    if (sourceMatch && req.method === 'GET') {
      await handleSourceVideoStream(req, res, sourceMatch[1]);
      return;
    }
    const sourceItemMatch = pathname.match(/^\/api\/tools\/source-videos\/([^/]+)$/);
    if (sourceItemMatch && req.method === 'DELETE') {
      await handleSourceVideoDelete(req, res, sourceItemMatch[1]);
      return;
    }
    if (sourceItemMatch && req.method === 'PATCH') {
      await handleSourceVideoMove(req, res, sourceItemMatch[1]);
      return;
    }
    if (pathname === '/api/tools/projects') {
      await handleProjects(req, res);
      return;
    }
    const projectMatch = pathname.match(/^\/api\/tools\/projects\/([^/]+)$/);
    if (projectMatch) {
      await handleProject(req, res, projectMatch[1]);
      return;
    }
    const screenshotMatch = pathname.match(/^\/api\/tools\/projects\/([^/]+)\/screenshots$/);
    if (screenshotMatch && req.method === 'POST') {
      await handleScreenshotUpload(req, res, screenshotMatch[1]);
      return;
    }
    const clipMatch = pathname.match(/^\/api\/tools\/projects\/([^/]+)\/clips$/);
    if (clipMatch && req.method === 'POST') {
      await handleClipCreate(req, res, clipMatch[1]);
      return;
    }
    const previewMatch = pathname.match(/^\/api\/tools\/projects\/([^/]+)\/mixed-gif\/preview$/);
    if (previewMatch && req.method === 'POST') {
      await handleMixedGif(req, res, previewMatch[1], false);
      return;
    }
    const exportMatch = pathname.match(/^\/api\/tools\/projects\/([^/]+)\/exports\/gif$/);
    if (exportMatch && req.method === 'POST') {
      await handleMixedGif(req, res, exportMatch[1], true);
      return;
    }
    if (pathname === '/api/tools/gif-combinations' && req.method === 'POST') {
      await handleGifCombinationCreate(req, res);
      return;
    }
    if (pathname === '/api/tools/published-gifs' && req.method === 'GET') {
      await handlePublishedGifs(req, res);
      return;
    }
    const publishedAssignMatch = pathname.match(/^\/api\/tools\/published-gifs\/([^/]+)\/assign$/);
    if (publishedAssignMatch && req.method === 'POST') {
      await handlePublishedGifAssign(req, res, publishedAssignMatch[1]);
      return;
    }
    const publishedHistoryMatch = pathname.match(/^\/api\/tools\/published-gifs\/([^/]+)\/history$/);
    if (publishedHistoryMatch && req.method === 'GET') {
      await handlePublishedGifHistory(req, res, publishedHistoryMatch[1]);
      return;
    }
    if (pathname === '/api/tools/assets') {
      await handleAssets(req, res);
      return;
    }
    const assetMatch = pathname.match(/^\/api\/tools\/assets\/([^/]+)\/file$/);
    if (assetMatch && req.method === 'GET') {
      await handleAssetFile(req, res, assetMatch[1]);
      return;
    }
    const assetItemMatch = pathname.match(/^\/api\/tools\/assets\/([^/]+)$/);
    if (assetItemMatch && req.method === 'PATCH') {
      await handleAssetUpdate(req, res, assetItemMatch[1]);
      return;
    }
    if (assetItemMatch && req.method === 'DELETE') {
      await handleAssetDelete(req, res, assetItemMatch[1]);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res);
      return;
    }
    sendJson(res, 404, { error: 'Not found.' });
  }).catch((error) => {
    sendError(res, error);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Tools API: http://${HOST}:${PORT}/`);
  console.log(`Tools PocketBase: ${PB_URL}`);
});
