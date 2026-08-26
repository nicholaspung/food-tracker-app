#!/usr/bin/env node

import chokidar from 'chokidar';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);
const prepareScript = path.join(repoDir, 'scripts/prepare-marketing.sh');
const sourceDir = path.join(repoDir, 'apps/marketing/dist');
const liveDir = path.join(repoDir, 'apps/marketing/.dev-dist');
const stagingDir = path.join(repoDir, 'apps/marketing/.dev-dist-staging');
const backupDir = path.join(repoDir, 'apps/marketing/.dev-dist-backup');
const port = Number.parseInt(process.env.MARKETING_DEV_PORT ?? '4173', 10);
const appOpenUrl = process.env.APP_OPEN_URL ?? 'http://localhost:8081/';
const iosAppStoreUrl =
  process.env.IOS_APP_STORE_URL ?? 'https://apps.apple.com/us/app/yummy-recs/id6761597807';
const ioniconsFontPath = require.resolve('@react-native-vector-icons/ionicons/fonts/Ionicons.ttf', {
  paths: [repoDir, path.join(repoDir, 'apps/mobile')],
});
const watchTargets = [
  sourceDir,
  path.join(repoDir, 'apps/mobile/assets/brand-logo.svg'),
  path.join(repoDir, 'apps/mobile/assets/brand-logo.png'),
  ioniconsFontPath,
];

let watcher;
let devServer;
let debounceTimer;
let rebuildInProgress = false;
let rebuildQueued = false;
let buildNumber = 0;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[MARKETING] ${message}\n`);
}

function logError(message) {
  process.stderr.write(`[MARKETING] ${message}\n`);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runPrepare(targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'bash',
      [prepareScript, sourceDir, targetDir],
      {
        cwd: repoDir,
        env: {
          ...process.env,
          APP_OPEN_URL: appOpenUrl,
          IOS_APP_STORE_URL: iosAppStoreUrl,
        },
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `prepare-marketing.sh terminated with signal ${signal}`
            : `prepare-marketing.sh exited with code ${code}`,
        ),
      );
    });
  });
}

async function swapPreparedOutput() {
  const liveExists = await pathExists(liveDir);

  await rm(backupDir, { force: true, recursive: true });

  if (liveExists) {
    await rename(liveDir, backupDir);
  }

  try {
    await rename(stagingDir, liveDir);
    await rm(backupDir, { force: true, recursive: true });
  } catch (error) {
    if (liveExists && !(await pathExists(liveDir)) && (await pathExists(backupDir))) {
      await rename(backupDir, liveDir);
    }

    throw error;
  } finally {
    await rm(stagingDir, { force: true, recursive: true });
  }
}

async function buildSite({ isInitialBuild, trigger }) {
  buildNumber += 1;
  const currentBuild = buildNumber;
  const label = isInitialBuild ? 'initial build' : `rebuild #${currentBuild}`;

  log(`${label}: preparing marketing assets${trigger ? ` after ${trigger}` : ''}`);

  await rm(stagingDir, { force: true, recursive: true });
  await runPrepare(stagingDir);
  await swapPreparedOutput();

  log(`${label}: assets ready`);
}

async function rebuildLoop(trigger) {
  if (rebuildInProgress) {
    rebuildQueued = true;
    return;
  }

  rebuildInProgress = true;

  try {
    await buildSite({ isInitialBuild: false, trigger });
    devServer?.ws.send({ type: 'full-reload' });
  } catch (error) {
    logError(`rebuild failed: ${error.message}`);
  } finally {
    rebuildInProgress = false;

    if (rebuildQueued && !shuttingDown) {
      rebuildQueued = false;
      await rebuildLoop('queued changes');
    }
  }
}

function scheduleRebuild(trigger) {
  if (shuttingDown) {
    return;
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void rebuildLoop(trigger);
  }, 150);
}

function createWatcher() {
  watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on('all', (eventName, changedPath) => {
    const relativePath = path.relative(repoDir, changedPath);
    log(`change detected (${eventName}): ${relativePath}`);
    scheduleRebuild(`${eventName} ${relativePath}`);
  });

  watcher.on('error', (error) => {
    logError(`watcher error: ${error.message}`);
  });
}

async function startServer() {
  devServer = await createViteServer({
    appType: 'mpa',
    clearScreen: false,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    root: liveDir,
    server: {
      host: 'localhost',
      open: false,
      port,
      strictPort: true,
    },
  });

  await devServer.listen();

  const resolvedUrl = devServer.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;
  log(`serving ${path.relative(repoDir, liveDir)} at ${resolvedUrl}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearTimeout(debounceTimer);

  if (watcher) {
    await watcher.close();
  }

  if (devServer) {
    await devServer.close();
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

process.on('SIGHUP', () => {
  void shutdown(0);
});

process.on('uncaughtException', (error) => {
  logError(`uncaught exception: ${error.stack ?? error.message}`);
  void shutdown(1);
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  logError(`unhandled rejection: ${message}`);
  void shutdown(1);
});

try {
  await buildSite({ isInitialBuild: true });
  await startServer();
  createWatcher();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logError(`startup failed: ${message}`);
  process.exit(1);
}
