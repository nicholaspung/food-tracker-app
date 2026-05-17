#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '');

const tutorials = [
  ['settings', 'tutorial-artifacts/ios/settings/2026-05-04T040801/raw.mov'],
  ['support-invites', 'tutorial-artifacts/ios/support-invites/2026-05-04T040706/raw.mov'],
  ['track-restaurant-visit', 'tutorial-artifacts/ios/track-restaurant-visit/2026-05-03T005338/raw.mov'],
  ['track-food-product', 'tutorial-artifacts/ios/track-food-product/2026-05-03T010540/raw.mov'],
  ['log-note', 'tutorial-artifacts/ios/log-note/2026-05-03T015622/raw.mov'],
  ['process-saved-photos', 'tutorial-artifacts/ios/process-saved-photos/2026-05-03T015742/raw.mov'],
  ['manage-notes', 'tutorial-artifacts/ios/manage-notes/2026-05-04T040238/raw.mov'],
  ['lists', 'tutorial-artifacts/ios/lists/2026-05-04T040424/raw.mov'],
  ['split-bill', 'tutorial-artifacts/ios/split-bill/2026-05-04T040525/raw.mov'],
  ['tip-calculator', 'tutorial-artifacts/ios/tip-calculator/2026-05-04T040343/raw.mov'],
];

const videoDir = join(repoRoot, 'apps/marketing/dist/tutorials');
const posterDir = join(repoRoot, 'apps/mobile/assets/onboarding/posters');

mkdirSync(videoDir, { recursive: true });
mkdirSync(posterDir, { recursive: true });

for (const [slug, relativeSource] of tutorials) {
  const source = join(repoRoot, relativeSource);
  const videoOutput = join(videoDir, `${slug}.mp4`);
  const posterOutput = join(posterDir, `${slug}.jpg`);

  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    source,
    '-vf',
    'fps=12,scale=480:-2',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '32',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    videoOutput,
  ]);

  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    '0.7',
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-2',
    '-q:v',
    '5',
    posterOutput,
  ]);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
