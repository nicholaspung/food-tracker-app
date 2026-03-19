#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, readdir, mkdir, rename, copyFile, unlink, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'apps/mobile/e2e/artifacts');
const baselinesDir = path.join(rootDir, 'apps/mobile/e2e/baselines');
const staticDir = path.join(rootDir, 'apps/mobile/e2e/review-ui');
const host = process.env.SCREENSHOT_REVIEW_HOST?.trim() || '127.0.0.1';
const port = Number.parseInt(process.env.SCREENSHOT_REVIEW_PORT ?? '4174', 10);
const defaultBaselineSet = process.env.SCREENSHOT_BASELINE_SET?.trim() || 'current';
const defaultFlowPath = process.env.SCREENSHOT_REVIEW_FLOW?.trim() || 'apps/mobile/e2e/maestro/flows/core-review.yaml';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIME_BY_EXTENSION = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function isSafePathSegment(value) {
  return typeof value === 'string' && value.length > 0 && value === path.basename(value) && !value.startsWith('.');
}

function normalizeBaselineSet(value) {
  if (!isSafePathSegment(value)) {
    return null;
  }

  return value;
}

function normalizeScreenshotName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmedValue) {
    return null;
  }

  return /\.[a-z0-9]+$/i.test(trimmedValue) ? trimmedValue : `${trimmedValue}.png`;
}

function resolveFlowPath(flowPath) {
  if (typeof flowPath !== 'string' || flowPath.trim().length === 0) {
    return path.join(rootDir, defaultFlowPath);
  }

  return path.isAbsolute(flowPath) ? flowPath : path.join(rootDir, flowPath);
}

async function parseExpectedScreenshotsFromFlow(flowPath) {
  const absoluteFlowPath = resolveFlowPath(flowPath);
  const contents = await readFile(absoluteFlowPath, 'utf8');
  const screenshots = [];

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*takeScreenshot:\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const screenshotName = normalizeScreenshotName(match[1]);
    if (screenshotName) {
      screenshots.push(screenshotName);
    }
  }

  return screenshots;
}

async function readRunMetadata(runName) {
  if (!isSafePathSegment(runName)) {
    return null;
  }

  const metadataPath = path.join(artifactsDir, runName, 'run.json');

  try {
    const rawContents = await readFile(metadataPath, 'utf8');
    const parsedContents = JSON.parse(rawContents);
    const flowPaths = Array.isArray(parsedContents.flowPaths)
      ? parsedContents.flowPaths.filter((value) => typeof value === 'string' && value.trim().length > 0)
      : typeof parsedContents.flowPath === 'string' && parsedContents.flowPath.trim().length > 0
        ? [parsedContents.flowPath.trim()]
        : [defaultFlowPath];
    const flowKeys = Array.isArray(parsedContents.flowKeys)
      ? parsedContents.flowKeys.filter((value) => typeof value === 'string' && value.trim().length > 0)
      : typeof parsedContents.flowKey === 'string' && parsedContents.flowKey.trim().length > 0
        ? [parsedContents.flowKey.trim()]
        : [];
    return {
      createdAt: typeof parsedContents.createdAt === 'string' ? parsedContents.createdAt : null,
      expectationSource: 'run_metadata',
      expectedScreenshots: Array.isArray(parsedContents.expectedScreenshots)
        ? parsedContents.expectedScreenshots.map((value) => normalizeScreenshotName(value)).filter(Boolean)
        : [],
      flowKey: flowKeys[0] ?? null,
      flowKeys,
      flowPath: flowPaths[0] ?? defaultFlowPath,
      flowPaths,
      runName: typeof parsedContents.runName === 'string' ? parsedContents.runName : runName,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function getRunExpectations(runName) {
  const metadata = await readRunMetadata(runName);
  if (metadata && metadata.expectedScreenshots.length > 0) {
    return metadata;
  }

  return {
    createdAt: null,
    expectationSource: 'default_flow',
    expectedScreenshots: await parseExpectedScreenshotsFromFlow(defaultFlowPath),
    flowKey: null,
    flowKeys: [],
    flowPath: defaultFlowPath,
    flowPaths: [defaultFlowPath],
    runName,
  };
}

function buildComparisonImageNames(expectedScreenshots, baselineImageNames) {
  const orderedNames = [];
  const seenNames = new Set();

  for (const name of [...expectedScreenshots, ...baselineImageNames]) {
    if (seenNames.has(name)) {
      continue;
    }

    seenNames.add(name);
    orderedNames.push(name);
  }

  return orderedNames;
}

function buildOrderedReviewImageNames(expectedScreenshots, baselineImageNames, actualImages) {
  const orderedNames = buildComparisonImageNames(expectedScreenshots, baselineImageNames);
  const seenNames = new Set(orderedNames);

  for (const name of actualImages) {
    if (seenNames.has(name)) {
      continue;
    }

    seenNames.add(name);
    orderedNames.push(name);
  }

  return orderedNames;
}

function buildRunSummary(expectedScreenshots, baselineImageNames, actualImages) {
  const expectedSet = new Set(expectedScreenshots);
  const baselineSet = new Set(baselineImageNames);
  const comparisonNames = buildComparisonImageNames(expectedScreenshots, baselineImageNames);
  const actualSet = new Set(actualImages);
  const missingArtifactNames = comparisonNames.filter((name) => !actualSet.has(name));
  const missingExpectedNames = expectedScreenshots.filter((name) => !actualSet.has(name));
  const missingBaselineNames = baselineImageNames.filter((name) => !actualSet.has(name));
  const baselineOnlyNames = baselineImageNames.filter((name) => !expectedSet.has(name));
  const unexpectedNames = actualImages.filter((name) => !expectedSet.has(name) && !baselineSet.has(name));

  return {
    actualCount: actualImages.length,
    baselineCount: baselineImageNames.length,
    baselineOnlyCount: baselineOnlyNames.length,
    comparisonCount: comparisonNames.length,
    expectedCount: expectedScreenshots.length,
    hasRegression: missingArtifactNames.length > 0,
    matchedComparisonCount: comparisonNames.length - missingArtifactNames.length,
    matchedExpectedCount: expectedScreenshots.length - missingExpectedNames.length,
    missingArtifactCount: missingArtifactNames.length,
    missingArtifactNames,
    missingBaselineCount: missingBaselineNames.length,
    missingBaselineNames,
    missingExpectedCount: missingExpectedNames.length,
    missingExpectedNames,
    unexpectedCount: unexpectedNames.length,
    unexpectedNames,
  };
}

async function getRunUpdatedAt(runName) {
  const candidatePaths = [
    path.join(artifactsDir, runName, 'screenshots'),
    path.join(artifactsDir, runName, 'run.json'),
    path.join(artifactsDir, runName),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const candidateStats = await stat(candidatePath);
      return candidateStats.mtime.toISOString();
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return new Date(0).toISOString();
}

async function listImageFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function listArtifactRuns(baselineSet) {
  const safeBaselineSet = normalizeBaselineSet(baselineSet) ?? defaultBaselineSet;
  const baselineImageNames = await listImageFiles(path.join(baselinesDir, safeBaselineSet));
  let entries = [];

  try {
    entries = await readdir(artifactsDir, { withFileTypes: true });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const screenshotsDir = path.join(artifactsDir, entry.name, 'screenshots');
        const images = await listImageFiles(screenshotsDir);
        const expectations = await getRunExpectations(entry.name);
        const summary = buildRunSummary(expectations.expectedScreenshots, baselineImageNames, images);
        return {
          baselineScreenshotCount: summary.baselineCount,
          expectationSource: expectations.expectationSource,
          expectedScreenshotCount: summary.expectedCount,
          flowKey: expectations.flowKey,
          flowKeys: expectations.flowKeys,
          flowPath: expectations.flowPath,
          flowPaths: expectations.flowPaths,
          hasRegression: summary.hasRegression,
          matchedArtifactCount: summary.matchedComparisonCount,
          matchedExpectedCount: summary.matchedExpectedCount,
          missingArtifactCount: summary.missingArtifactCount,
          missingExpectedCount: summary.missingExpectedCount,
          name: entry.name,
          reviewScreenshotCount: summary.comparisonCount,
          screenshotCount: images.length,
          unexpectedCount: summary.unexpectedCount,
          updatedAt: await getRunUpdatedAt(entry.name),
        };
      }),
  );

  return runs
    .filter(Boolean)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function listBaselineSets() {
  let entries = [];

  try {
    entries = await readdir(baselinesDir, { withFileTypes: true });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

async function getRunDetails(runName, baselineSet) {
  if (!isSafePathSegment(runName)) {
    return null;
  }

  const safeBaselineSet = normalizeBaselineSet(baselineSet) ?? defaultBaselineSet;
  const screenshotsDir = path.join(artifactsDir, runName, 'screenshots');
  const baselineImageNames = await listImageFiles(path.join(baselinesDir, safeBaselineSet));
  const actualImageNames = await listImageFiles(screenshotsDir);
  const expectations = await getRunExpectations(runName);
  const expectedSet = new Set(expectations.expectedScreenshots);
  const baselineSetNames = new Set(baselineImageNames);
  const actualSet = new Set(actualImageNames);
  const comparisonSet = new Set(buildComparisonImageNames(expectations.expectedScreenshots, baselineImageNames));
  const orderedImageNames = buildOrderedReviewImageNames(
    expectations.expectedScreenshots,
    baselineImageNames,
    actualImageNames,
  );
  const summary = buildRunSummary(expectations.expectedScreenshots, baselineImageNames, actualImageNames);

  const images = await Promise.all(
    orderedImageNames.map(async (name) => {
      const baselineExists = baselineSetNames.has(name);

      return {
        artifactMissing: comparisonSet.has(name) && !actualSet.has(name),
        name,
        artifactUrl: actualSet.has(name)
          ? `/files/artifacts/${encodeURIComponent(runName)}/${encodeURIComponent(name)}`
          : null,
        baselineUrl: baselineExists
          ? `/files/baselines/${encodeURIComponent(safeBaselineSet)}/${encodeURIComponent(name)}`
          : null,
        hasArtifact: actualSet.has(name),
        hasBaseline: baselineExists,
        isBaselineOnly: baselineSetNames.has(name) && !expectedSet.has(name),
        isExpected: expectedSet.has(name),
        isUnexpected: !comparisonSet.has(name),
      };
    }),
  );

  return {
    run: runName,
    baselineSet: safeBaselineSet,
    expectationSource: expectations.expectationSource,
    flowKey: expectations.flowKey,
    flowKeys: expectations.flowKeys,
    flowPath: expectations.flowPath,
    flowPaths: expectations.flowPaths,
    images,
    summary,
  };
}

async function getBaselineDetails(baselineSet) {
  const safeBaselineSet = normalizeBaselineSet(baselineSet) ?? defaultBaselineSet;
  const baselineImageNames = await listImageFiles(path.join(baselinesDir, safeBaselineSet));

  return {
    baselineSet: safeBaselineSet,
    images: baselineImageNames.map((name) => ({
      baselineUrl: `/files/baselines/${encodeURIComponent(safeBaselineSet)}/${encodeURIComponent(name)}`,
      hasBaseline: true,
      name,
    })),
    summary: {
      baselineCount: baselineImageNames.length,
    },
  };
}

async function moveFile(sourcePath, targetPath) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EXDEV') {
      throw error;
    }

    await copyFile(sourcePath, targetPath);
    await unlink(sourcePath);
  }
}

async function promoteScreenshot(runName, baselineSet, filename) {
  if (!isSafePathSegment(runName) || !isSafePathSegment(filename)) {
    throw new Error('Invalid run or filename.');
  }

  const safeBaselineSet = normalizeBaselineSet(baselineSet);
  if (!safeBaselineSet) {
    throw new Error('Invalid baseline set.');
  }

  const sourcePath = path.join(artifactsDir, runName, 'screenshots', filename);
  const baselineDirectory = path.join(baselinesDir, safeBaselineSet);
  const targetPath = path.join(baselinesDir, safeBaselineSet, filename);

  await mkdir(baselineDirectory, { recursive: true });

  try {
    const targetStats = await stat(targetPath);
    if (targetStats.isFile()) {
      await unlink(targetPath);
    }
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  await moveFile(sourcePath, targetPath);

  return {
    ok: true,
    baselineSet: safeBaselineSet,
    filename,
    run: runName,
  };
}

async function deleteArtifactRun(runName) {
  if (!isSafePathSegment(runName)) {
    throw new Error('Invalid run name.');
  }

  await rm(path.join(artifactsDir, runName), { force: true, recursive: true });

  return {
    ok: true,
    run: runName,
  };
}

async function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function sendStaticFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  const contents = await readFile(filePath);
  response.writeHead(200, { 'Content-Type': mimeType });
  response.end(contents);
}

async function sendImage(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  const contents = await readFile(filePath);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': mimeType,
  });
  response.end(contents);
}

function getStaticFilePath(urlPathname) {
  const relativePath = urlPathname === '/' ? 'index.html' : urlPathname.slice(1);
  const resolvedPath = path.resolve(staticDir, relativePath);

  if (!resolvedPath.startsWith(staticDir)) {
    return null;
  }

  return resolvedPath;
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);

    if (request.method === 'GET' && requestUrl.pathname === '/api/overview') {
      const baselineSet = requestUrl.searchParams.get('baselineSet');
      const [artifactRuns, baselineSets] = await Promise.all([listArtifactRuns(baselineSet), listBaselineSets()]);
      await sendJson(response, 200, {
        artifactRuns,
        baselineSets,
        defaultBaselineSet,
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/run') {
      const run = requestUrl.searchParams.get('run');
      const baselineSet = requestUrl.searchParams.get('baselineSet');

      if (!run) {
        await sendJson(response, 400, { error: 'Missing run parameter.' });
        return;
      }

      const details = await getRunDetails(run, baselineSet);
      if (!details) {
        await sendJson(response, 404, { error: 'Run not found.' });
        return;
      }

      await sendJson(response, 200, details);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/baselines') {
      const baselineSet = requestUrl.searchParams.get('baselineSet');
      const details = await getBaselineDetails(baselineSet);
      await sendJson(response, 200, details);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/promote') {
      let requestBody = '';

      for await (const chunk of request) {
        requestBody += chunk;
      }

      const parsedBody = JSON.parse(requestBody || '{}');
      const result = await promoteScreenshot(parsedBody.run, parsedBody.baselineSet, parsedBody.filename);
      await sendJson(response, 200, result);
      return;
    }

    if (request.method === 'DELETE' && requestUrl.pathname === '/api/run') {
      const run = requestUrl.searchParams.get('run');

      if (!run) {
        await sendJson(response, 400, { error: 'Missing run parameter.' });
        return;
      }

      const result = await deleteArtifactRun(run);
      await sendJson(response, 200, result);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname.startsWith('/files/')) {
      const parts = requestUrl.pathname.split('/').filter(Boolean);

      if (parts.length !== 4) {
        await sendJson(response, 404, { error: 'File not found.' });
        return;
      }

      const [, rootType, firstSegment, filename] = parts;

      if (!isSafePathSegment(firstSegment) || !isSafePathSegment(filename)) {
        await sendJson(response, 400, { error: 'Invalid file request.' });
        return;
      }

      const filePath =
        rootType === 'artifacts'
          ? path.join(artifactsDir, firstSegment, 'screenshots', filename)
          : rootType === 'baselines'
            ? path.join(baselinesDir, firstSegment, filename)
            : null;

      if (!filePath) {
        await sendJson(response, 404, { error: 'File root not found.' });
        return;
      }

      await sendImage(response, filePath);
      return;
    }

    if (request.method === 'GET') {
      const filePath = getStaticFilePath(requestUrl.pathname);

      if (!filePath) {
        await sendJson(response, 404, { error: 'Not found.' });
        return;
      }

      await sendStaticFile(response, filePath);
      return;
    }

    await sendJson(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT' ? 404 : 500;
    await sendJson(response, statusCode, {
      error: error instanceof Error ? error.message : 'Unknown server error.',
    });
  }
});

server.listen(port, host, () => {
  console.log(`Screenshot review server running at http://${host}:${port}`);
  console.log(`Artifacts: ${artifactsDir}`);
  console.log(`Baselines: ${baselinesDir}`);
});
