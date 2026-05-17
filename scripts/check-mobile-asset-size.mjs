#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '');
const assetRoot = join(repoRoot, 'apps/mobile/assets');
const maxFileBytes = 1024 * 1024;
const maxTotalBytes = 10 * 1024 * 1024;

const files = collectFiles(assetRoot)
  .map((filePath) => ({
    path: filePath,
    size: statSync(filePath).size,
  }))
  .sort((left, right) => right.size - left.size);

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const oversizedFiles = files.filter((file) => file.size > maxFileBytes);
const failures = [];

if (oversizedFiles.length > 0) {
  failures.push(`Files over ${formatBytes(maxFileBytes)}: ${oversizedFiles.length}`);
}

if (totalBytes > maxTotalBytes) {
  failures.push(`Total mobile asset size ${formatBytes(totalBytes)} exceeds ${formatBytes(maxTotalBytes)}`);
}

if (failures.length > 0) {
  console.error('Mobile asset size check failed.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('\nLargest mobile assets:');
  for (const file of files.slice(0, 20)) {
    console.error(`${formatBytes(file.size).padStart(9)}  ${relative(repoRoot, file.path)}`);
  }
  process.exit(1);
}

console.log(`Mobile asset size OK: ${formatBytes(totalBytes)} total, ${files.length} files.`);

function collectFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }

  return `${(kib / 1024).toFixed(2)} MB`;
}
