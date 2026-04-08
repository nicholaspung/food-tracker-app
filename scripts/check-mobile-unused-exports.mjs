import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileWorkspaceRoot = path.join(repoRoot, 'apps', 'mobile');
const baselinePath = path.join(mobileWorkspaceRoot, 'knip-unused-code-baseline.json');
const trackedMobileFiles = new Set(
  execFileSync('git', ['ls-files', '-z', 'apps/mobile'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .split('\0')
    .filter(Boolean)
    .map((filePath) => filePath.split(path.sep).join('/')),
);

function toRepoRelative(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : filePath.startsWith('apps/mobile/')
      ? path.join(repoRoot, filePath)
      : path.join(mobileWorkspaceRoot, filePath);

  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function collectIssues(report) {
  const issues = [];

  for (const issue of report.issues ?? []) {
    for (const fileIssue of issue.files ?? []) {
      const repoRelativePath = toRepoRelative(fileIssue.name);
      if (!trackedMobileFiles.has(repoRelativePath)) {
        continue;
      }

      issues.push(`file:${repoRelativePath}`);
    }

    for (const exportIssue of issue.exports ?? []) {
      const repoRelativePath = toRepoRelative(issue.file);
      if (!trackedMobileFiles.has(repoRelativePath)) {
        continue;
      }

      issues.push(`export:${repoRelativePath}#${exportIssue.name}`);
    }
  }

  return [...new Set(issues)].sort();
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (!Array.isArray(baseline.issues)) {
  throw new Error(`Expected "issues" array in ${baselinePath}.`);
}

const reportOutput = execFileSync(
  'pnpm',
  [
    '--filter',
    '@food-tracker/mobile',
    'exec',
    'knip',
    '--include',
    'files,exports',
    '--reporter',
    'json',
    '--no-exit-code',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);

const actualIssues = collectIssues(JSON.parse(reportOutput));
const baselineIssues = [...new Set(baseline.issues)].sort();
const actualIssueSet = new Set(actualIssues);
const baselineIssueSet = new Set(baselineIssues);

const newIssues = actualIssues.filter((issue) => !baselineIssueSet.has(issue));
const resolvedIssues = baselineIssues.filter((issue) => !actualIssueSet.has(issue));

if (newIssues.length > 0) {
  console.error('New unused mobile exports/files detected beyond the committed baseline:');
  for (const issue of newIssues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Mobile unused export baseline check passed (${actualIssues.length} tracked issues).`);

if (resolvedIssues.length > 0) {
  console.log('Resolved baseline issues detected. Consider updating apps/mobile/knip-unused-code-baseline.json:');
  for (const issue of resolvedIssues) {
    console.log(`- ${issue}`);
  }
}
